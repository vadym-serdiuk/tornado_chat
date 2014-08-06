import calendar
import json
import datetime
from operator import itemgetter
import os
from bson.objectid import ObjectId
from pymongo import MongoClient
import hashlib
import re
import sys

__author__ = 'serdiuk'

import tornado
from tornado import web, ioloop, websocket

def make_password(password):
    h = hashlib.md5()
    h.update(password)
    return h.hexdigest()

def start_session(handler, username):
    key = handler.application.db.sessions.insert(
        {'username': username,
         'start_time': datetime.datetime.utcnow()}
    )
    handler.set_secure_cookie('session', str(key))


class Chat(web.Application):
    def __init__(self):

        mongo_url = os.environ.get('MONGOHQ_URL', 'localhost')
        client = MongoClient(mongo_url)
        try:
            self.db = client.get_default_database()
        except:
            self.db = client.db

        self.sockets = []
        self.rooms = {}

        handlers = [
            (r'^/$', MainHandler),
            (r'^/login$', LoginHandler),
            (r'^/signup$', SignupHandler),
            (r'^/static/(.*)', tornado.web.StaticFileHandler,
                {'path': 'static/'}),
            (r'^/chat$', WebSocketHandler),
        ]

        settings = {
            'autoreload': True,
            'cookie_secret': "asdfasdfasgdfg2rqwtqe4f34fw34r43",
            'Debug': True
        }

        super(Chat, self).__init__(handlers=handlers, **settings)

    def authenticate(self, username, password):
        user = self.db.users.find_one(
            {'username': username,
             'password': make_password(password)}
        )
        if user:
            return True
        else:
            return False


class MainHandler(web.RequestHandler):
    def get(self, *args, **kwargs):
        return self.render('templates/chat.html', **{'url': self.request.host})


class SignupHandler(web.RequestHandler):
    def post(self, *args, **kwargs):
        username = self.get_argument('username')
        password = self.get_argument('password')

        if self.application.db.users.find_one({'username': username}):
            data = {'status': 'error',
                    'message': 'This username already is in use'}
        else:
            self.application.db.users.insert({'username': username,
                                  'password': make_password(password)})
            start_session(self, username)
            data = {'status': 'success'}
        self.finish(json.dumps(data))


class LoginHandler(web.RequestHandler):
    """
    Client send by method POST authentication data
    If user is found, then it needs to start session
    """
    def post(self, *args, **kwargs):

        self.clear_cookie('session')
        username = self.get_argument('username')
        password = self.get_argument('password')
        if not username:
            data = {"status": "error", "message": "username is empty"}
        elif not password:
            data = {"status": "error", "message": "password is empty"}
        elif self.application.authenticate(username, password):
            data = {"status": "success"}
            start_session(self, username)
        else:
            data = {"status": "error", "message": "username or password are incorrect"}
        self.finish(json.dumps(data))



COMMANDS = (

    (re.compile(r'/join (\w{24})'), 'join_room'),
    (re.compile(r'/create ([a-zA-Z]+[\w\s]{0,30})'), 'create_room'),
    (re.compile(r'/leave (\w{24})'), 'leave_room'),
    (re.compile(r'/rooms'), 'rooms_list'),
    (re.compile(r'/ping'), 'custom_ping'),
    (re.compile(r'/get_history (\w{24})'), 'get_history'),

)


class WebSocketHandler(websocket.WebSocketHandler):
    user = 'unknown'

    @tornado.web.asynchronous
    def get(self, *args, **kwargs):
        print(self.request)
        sys.stdout.flush()
        super(WebSocketHandler, self).get(*args, **kwargs)

    def send_history(self, room):
        """
        Gets today messages from room and sends their to user
        :param room:
        :return:
        """
        time = datetime.datetime.utcnow()
        time = time.replace(hour=0, minute=0, second=0)
        timestamp = calendar.timegm(time.utctimetuple())

        history = self.application.db.chat.find(
            {'time': {'$gte': timestamp}}).sort('_id', 1)
        history = sorted(history, key=itemgetter('_id'))
        for msg in history:
            del msg['_id']
            msg['is_history'] = True
            if self.ws_connection:
                self.ws_connection.write_message(json.dumps(msg))

    def join_room(self, match):
        """
        Join the room for recieving messages from this room
        :param room:
        :return:
        """
        db = self.application.db

        room = match.group(1)
        if not db.rooms.find({'_id': ObjectId(room)}):
            msg = {'text': 'There is no room with this id',
                   'status': 'error',
                   'command': 'join'}
            if self.ws_connection:
                self.ws_connection.write_message(json.dumps(msg))
            return

        db.joined_rooms.update({'user': self.user},
                               {'$addToSet': {'rooms': room}},
                               upsert=True)

        if room in self.application.rooms:
            self.application.rooms[room].append(self)
        else:
            self.application.rooms[room] = [self]

        msg = {'server_event': 'room_joined',
               'room': room}
        if self.ws_connection:
            self.ws_connection.write_message(json.dumps(msg))

        self.send_history(room)
        msg = {'text': 'Has join this room',
               'room': room}
        self.send_message(msg)

    def create_room(self, match):
        """
        Creates the room if it is not exists
        :param match:
        :return:
        """
        room = match.group(1)

        if self.application.db.rooms.find({'name': room}).count() > 0:
            msg = {'message': 'The room with this name is already exists',
                   'status': 'error'}
            if self.ws_connection:
                self.ws_connection.write_message(json.dumps(msg))
            return

        room_id = self.application.db.rooms.insert({'name': room})
        msg = {'server_event': 'room_created',
               'room': str(room_id)}

        self.send_broadcast(msg)

    def leave_room(self, match):
        """
        Leaves the room
        :param match:
        :return:
        """
        room = match.group(1)
        try:
            room_sockets = self.application.rooms[room]
            key = room_sockets.index(self)
            del room_sockets[key]
        except IndexError:
            pass

        msg = {'username': self.user,
               'text': 'Has left this room',
               'room': room}
        self.send_message(msg)

        self.application.db.joined_rooms.update({'user': self.user},
                                                {'$pull': {'rooms': room}})

        msg = {'server_event': 'room_left', 'room': room}
        if self.ws_connection:
            self.ws_connection.write_message(json.dumps(msg))

    def rooms_list(self, res):
        db = self.application.db
        pyrooms = db.rooms.find().sort('name', 1)
        rooms = []
        for room in pyrooms:
            rooms.append({'code': str(room['_id']),
                          'name': room['name'],
                          'joined': str(room['_id']) in self.joined_rooms}
            )
        msg = {'server_event': 'rooms_list',
               'list': rooms}
        if self.ws_connection:
            self.ws_connection.write_message(json.dumps(msg))

    def custom_ping(self, match):
        return

    def get_history(self, match):
        room = match.group(1)
        self.send_history(room)

    def check_command(self, message):
        """
        If command is in message then process command and return True
        else return False
        :param message:
        :return:
        """
        for command in COMMANDS:
            res = re.match(command[0], message)
            if res:
                handler = getattr(self, command[1])
                handler(res)
                return True
        return False

    def send_broadcast(self, message):
        """
        Sends message to all opened sockets
        :param message:
        :return:
        """
        for socket in self.application.sockets:
                socket.ws_connection.write_message(
                    json.dumps(message))

    def send_message(self, message):
        """
        Sends message to all room members
        :param message:
        :return:
        """
        message['username'] = self.user
        message['time'] = calendar.timegm(datetime.datetime.utcnow().utctimetuple())
        room = message.get('room')
        if room:
            self.application.db.chat.insert(message)
            del(message['_id'])
            if room in self.application.rooms:
                for socket in self.application.rooms[room]:
                    if socket.ws_connection:
                        socket.ws_connection.write_message(
                            json.dumps(message))

    def open(self):
        """
        Trying to open connection
        Check user authorization
        :return:
        """
        key = self.get_secure_cookie('session')
        if not key:
            self.close(1, 'User is not authorized')

        user = None
        try:
            user = self.application.db.sessions.find_one({'_id': ObjectId(key)})
        except:
            self.close(1, sys.exc_info())

        if user:
            self.application.sockets.append(self)
            self.user = user['username']
        else:
            self.close(1, 'User is not authorized')

        for room in self.joined_rooms:
            if not room in self.application.rooms:
                self.application.rooms[room] = []
            if not self in self.application.rooms[room]:
                self.application.rooms[room].append(self)

    def on_message(self, message):
        """
        when a message is recieved, then process command or
        send message to everybody
        :param message:
        :return:
        """
        message = message.strip()
        if self.check_command(message):
            return

        try:
            msg = json.loads(message)
        except:
            msg = {'status': 'error', 'message': 'Unrecognized expression'}
            if self.ws_connection:
                self.ws_connection.write_message(json.dumps(msg))
            return
        self.send_message(msg)

    def on_close(self, message=None):
        """
        If connection closed by client then it needs to leave all rooms
        and delete socket from array
        :param message:
        :return:
        """
        try:
            key = self.application.sockets.index(self)
            del self.application.sockets[key]
        except (IndexError, ValueError):
            pass

        rooms = self.application.rooms
        for room in rooms:
            if self in rooms[room]:
                key = rooms[room].index(self)
                del rooms[room][key]

    @property
    def joined_rooms(self):
        joined_rooms_obj = self.application.db.joined_rooms\
            .find_one({'user': self.user})
        joined_rooms = []
        if joined_rooms_obj:
            joined_rooms = joined_rooms_obj['rooms']
        return joined_rooms

if __name__ == '__main__':
    application = Chat()
    port = os.environ.get('PORT', 5000)
    application.listen(port)
    print("Started at port %s" % port)
    tornado.ioloop.IOLoop.instance().start()

import calendar
import json
import datetime
from operator import itemgetter
import os
from bson.objectid import ObjectId
from pymongo import MongoClient
import hashlib
import re

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
    handler.set_cookie('session', str(key))


class Chat(web.Application):
    def __init__(self):

        mongo_url = os.environ.get('MONGOHQ_URL', 'localhost')
        self.db = MongoClient(mongo_url).db
        self.sockets = []

        handlers = [
            (r'^/$', MainHandler),
            (r'^/login$', LoginHandler),
            (r'^/signup$', SignupHandler),
            (r'^/static/(.*)', tornado.web.StaticFileHandler,
                {'path': 'static/'}),
            (r'^/rooms', RoomsListHandler),
            (r'^/chat$', WebSocketHandler),
        ]

        settings = {
            'autoreload': True,
            'cookie_secret': "asdfasdfasgdfg2rqwtqe4f34fw34r43"
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
    def post(self, *args, **kwargs):
        username = self.get_argument('username')
        password = self.get_argument('password')
        if self.application.authenticate(username, password):
            data = {'status': 'success'}
            start_session(self, username)
        else:
            data = {'status': 'error', 'message': 'Authorization failed'}
        self.finish(json.dumps(data))


class RoomsListHandler(web.RequestHandler):
    def get(self, *args, **kwargs):
        pyrooms = self.application.db.rooms.find().sort('name', 1)
        rooms = [room['name'] for room in pyrooms]
        self.finish(json.dumps(rooms))


COMMANDS = (
    (re.compile(r'/join ([\w\s-]+)'), 'join_room'),
    (re.compile(r'/create ([\w\s-]+)'), 'create_room')
)


class WebSocketHandler(websocket.WebSocketHandler):
    user = 'unknown'
    joined_rooms = set()

    def send_history(self, room):
        """
        Gets 5 last messages from room and sends their to user
        :param room:
        :return:
        """
        history = self.application.db.chat.find({'room': room})\
                        .sort('time', -1)[:5]
        history = sorted(history, key=itemgetter('_id'))
        for msg in history:
            self.ws_connection.write_message(
                json.dumps(msg))

    def join_room(self, match):
        """
        Join the room for recieving messages from this room
        :param room:
        :return:
        """
        room = match.group(0)
        if not self.application.db.rooms.find(name=room):
            msg = {'text': 'There is no room with this name',
                   'status': 'error',
                   'command': 'join'}
            self.ws_connection.write_message(json.dumps(msg))
            return

        self.joined_rooms.add(room)
        if not room in self.application.rooms:
            self.application.rooms[room] = [self]
        else:
            self.application.rooms[room].append(self)

        msg = {'text': 'Has join this room',
               'status': 'success',
               'command': 'join'}
        self.ws_connection.write_message(json.dumps(msg))

        self.send_history(room)
        msg = {'text': 'Has join this room',
               'room': room}
        self.send_message(room)

    def create_room(self, match):
        """
        Creates the room if it is not exists
        :param match:
        :return:
        """
        room = match.group(0)

        if self.application.db.rooms.find(name=room):
            msg = {'text': 'The room with this name is already exixsts',
                   'status': 'error',
                   'command': 'create'}
            self.ws_connection.write_message(json.dumps(msg))
            return

        self.application.db.rooms.insert(room)
        msg = {'text': 'Room was created',
               'status': 'success',
               'command': 'create'}

        self.application.rooms[room] = [self]
        self.ws_connection.write_message(json.dumps(msg))
        msg = {'event': 'room_created'}
        self.send_message(msg)

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

    def send_message(self, message):
        message['username'] = self.user
        message['time'] = calendar.timegm(datetime.datetime.utcnow().utctimetuple())
        room = message.get('room')
        if room:
            self.application.db.chat.insert(message)
            del(message['_id'])
            for socket in self.application.rooms['room']:
                socket.ws_connection.write_message(
                    json.dumps(message))

    def open(self):
        key = self.get_cookie('session')
        user = self.application.db.sessions.find_one({'_id': ObjectId(key)})
        if user:
            self.application.sockets.append(self)
            self.user = user['username']
        else:
            self.close(1, 'User is not authorized')

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
        msg = json.loads(message)
        self.send_message(msg)

    def on_close(self, message=None):
        try:
            key = self.application.sockets.index(self)
            del self.application.sockets[key]
        except IndexError:
            pass

        msg = {'username': self.user,
               'text': 'Has left this room'}
        self.send_message(msg)


if __name__ == '__main__':
    application = Chat()
    port = os.environ.get('PORT', 5000)
    application.listen(port)
    print "Started at port %s" % port
    tornado.ioloop.IOLoop.instance().start()

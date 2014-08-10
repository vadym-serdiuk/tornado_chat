__author__ = 'vserdyuk'

import json
import os
import time
from urllib import urlencode
import urllib2
from bson import ObjectId
from pymongo import MongoClient
import pika

EXCHANGE_NAME = 'chat'
EXCHANGE_TYPE = 'direct'
QUEUE = 'process'

START_ROUTING_KEY = 'get'
CHECK_ROUTING_KEY = 'check'
COMPLETE_ROUTING_KEY = 'completed'

rabbit_url = os.environ.get('CLOUDAMQP_URL', 'amqp://guest:guest@localhost/%2F')

connection = pika.BlockingConnection(pika.URLParameters(rabbit_url))

channel = connection.channel()

mongo_url = os.environ.get('MONGOHQ_URL', 'localhost')
client = MongoClient(mongo_url)
try:
    db = client.get_default_database()
except:
    db = client.db


def publish_message(message, key):
    properties = pika.BasicProperties(content_type='application/json')

    channel.basic_publish(EXCHANGE_NAME, key,
                          json.dumps(message, ensure_ascii=False),
                          properties)
    
def publish_screenshot_completed(id, canceled=False):
        message = {'id': id, 'canceled': canceled}
        publish_message(message, COMPLETE_ROUTING_KEY)


def publish_screenshots_getting(urls):

    message = {'urls': urls}
    publish_message(message, START_ROUTING_KEY)

def publish_start_checking(id_webshot, id_url):

        message = {'id_webshot': id_webshot,
                   'id_url': id_url}
        publish_message(message, CHECK_ROUTING_KEY)

def on_message(ch, basic_deliver, properties, body):
    if basic_deliver.routing_key == START_ROUTING_KEY:
        message = json.loads(body)
        print('Start screenshot message recieved %s', message['urls'])
        start_screenshots_creating(message['urls'])
        ch.basic_ack(basic_deliver.delivery_tag)
    elif basic_deliver.routing_key == CHECK_ROUTING_KEY:
        print('Check screenshot message recieved %s', body)
        message = json.loads(body)
        check_screnshots(message['id_webshot'], message['id_url'])
        ch.basic_ack(basic_deliver.delivery_tag)

def start_screenshots_creating(urls):
    for id_url in urls:
        url = db.urls.find_one({'_id': ObjectId(id_url)})
        params = {'url': url['url'],
                  'key': '1jXFaPpYikX9jQjfeSlHZvFuThR'}

        try:
            response = urllib2.urlopen(
                'https://api.browshot.com/api/v1/screenshot/create?%s'
                % urlencode(params))
        except:
            return

        data = json.loads(response.read().decode())
        id_webshot = data['id']
        publish_start_checking(id_webshot, id_url)

def check_screnshots(id_webshot, id_url):
    time.sleep(5)
    params = {'id': id_webshot,
              'key': '1jXFaPpYikX9jQjfeSlHZvFuThR'}

    try:
        f = urllib2.urlopen(
            'https://api.browshot.com/api/v1/screenshot/info?%s'
            % urlencode(params))
    except:
        return

    data = json.loads(f.read().decode())
    if data['status'] in('in_queue', 'in_process'):
        publish_start_checking(id_webshot, id_url)
    elif data['status'] == 'finished':

        url = db.urls.find_one({'_id': ObjectId(id_url)})
        url['src'] = data['screenshot_url']
        db.urls.save(url)
        for message in db.chat.find({'urls.id': id_url}):
            for url in message['urls']:
                if url['id'] == id_url:
                    url['ready'] = True
                    url['src'] = data['screenshot_url']
            db.chat.save(message)
        publish_screenshot_completed(id_url)
    else:
        db.urls.update({'_id': ObjectId(id_url)},
            {'$inc': {'errors': 1}})
        url = db.urls.find_one({'_id': ObjectId(id_url)})
        if url:
            if url['errors'] < 3:
                publish_screenshots_getting([id_url])
            else:
                message = db.chat.find_one({'urls.id': id_url})
                if message:
                    message['urls'] = \
                        [url for url in message['urls'] if url['id']!=id_url]
                    if message['urls'] == []:
                        del message['urls']
                    db.chat.save(message)
                db.urls.remove({'_id': ObjectId(id_url)})
                publish_screenshot_completed(id_url, True)


channel.exchange_declare(EXCHANGE_NAME)
channel.queue_declare(queue=QUEUE)
channel.queue_bind(exchange=EXCHANGE_NAME,
                   queue=QUEUE,
                   routing_key=START_ROUTING_KEY)
channel.queue_bind(exchange=EXCHANGE_NAME,
                   queue=QUEUE,
                   routing_key=CHECK_ROUTING_KEY)
channel.basic_qos(prefetch_count=1)
channel.basic_consume(on_message,
                      queue=QUEUE)

channel.start_consuming()
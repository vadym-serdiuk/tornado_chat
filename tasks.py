import os
import time

__author__ = 'vserdyuk'

import pika

EXCHANGE_NAME = 'exchange'
EXCHANGE_TYPE = 'direct'
QUEUE = 'screenshots'

START_ROUTING_KEY = 'get'
CHECK_ROUTING_KEY = 'check'

rabbit_url = os.environ.get('CLOUDAMQP_URL', 'amqp://guest:guest@localhost/%2F')

connection = pika.BlockingConnection(pika.URLParameters(rabbit_url))
channel = connection.channel()

channel.queue_declare(queue=QUEUE)
def callback(ch, method, properties, body):
    print " [x] Received %r %r" % (body, method)
    time.sleep( 5 )
    print " [x] Done"
    ch.basic_ack(delivery_tag = method.delivery_tag)

channel.basic_qos(prefetch_count=1)
channel.basic_consume(callback,
                      queue=QUEUE)

channel.start_consuming()
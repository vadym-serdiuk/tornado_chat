import os

__author__ = 'vserdyuk'

import pika

EXCHANGE_NAME = 'exchange'
EXCHANGE_TYPE = 'direct'
QUEUE = 'screenshots'
ROUTING_KEY = 'completed'

rabbit_url = os.environ.get('CLOUDAMQP_URL', 'amqp://guest:guest@localhost/%2F')
connection = pika.BlockingConnection(pika.URLParameters(rabbit_url))
channel = connection.channel()

channel.queue_declare(queue=QUEUE)

channel.basic_publish(exchange=EXCHANGE_NAME,
                      routing_key=ROUTING_KEY,
                      body='Hello World!')
print " [x] Sent 'Hello World!'"
connection.close()
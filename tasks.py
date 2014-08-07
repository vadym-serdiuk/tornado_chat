__author__ = 'vserdyuk'

import pika

EXCHANGE_NAME = 'exchange'
EXCHANGE_TYPE = 'direct'
QUEUE = 'screenshots'
ROUTING_KEY = 'screenshot_copleted'

connection = pika.BlockingConnection(pika.ConnectionParameters(
        host='localhost'))
channel = connection.channel()

channel.queue_declare(queue=QUEUE)

channel.basic_publish(exchange=EXCHANGE_NAME,
                      routing_key=ROUTING_KEY,
                      body='Hello World!')
print " [x] Sent 'Hello World!'"
connection.close()
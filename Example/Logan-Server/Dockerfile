FROM node:8.14.0-alpine

EXPOSE 3000

RUN mkdir /code

COPY ./ /code
WORKDIR /code

VOLUME /code/log

RUN npm install

CMD node server.js
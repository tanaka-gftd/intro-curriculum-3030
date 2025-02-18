'use strict';
const pug = require('pug');
const Post = require('./post');
const util = require('./handler-util');

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);
const crypto = require('crypto');

const oneTimeTokenMap = new Map(); // キーをユーザー名、値をトークンとする連想配列

async function handle(req, res) {
  switch (req.method) {
    case 'GET':
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      const posts = await Post.findAll({order:[['id', 'DESC']]});
      posts.forEach((post) => {
        post.formattedCreatedAt = dayjs(post.createdAt).tz('Asia/Tokyo').format('YYYY年MM月DD日 HH時mm分ss秒');
      });
      const oneTimeToken = crypto.randomBytes(8).toString('hex');
      oneTimeTokenMap.set(req.user, oneTimeToken);
      res.end(pug.renderFile('./views/posts.pug', {
        posts, 
        user: req.user,
        oneTimeToken
      }));
      console.info(
        `閲覧されました: user: ${req.user}, ` +
        `remoteAddress: ${req.socket.remoteAddress}, ` +
        `userAgent: ${req.headers['user-agent']} `
      );
      break;
    case 'POST':
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      }).on('end', async () => {
        const params = new URLSearchParams(body);
        const content = params.get('content');
        const requestedOneTimeToken = params.get('oneTimeToken');
        if (!(content && requestedOneTimeToken)) {
          util.handleBadRequest(req, res);
        } else {
          if (oneTimeTokenMap.get(req.user) === requestedOneTimeToken) {
            console.info(`送信されました: ${content}`);
            await Post.create({
              content: content,
              postedBy: req.user
            });
            oneTimeTokenMap.delete(req.user);
            handleRedirectPosts(req, res);
          } else {
            util.handleBadRequest(req, res);
          }
        }
      });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}

function handleRedirectPosts(req, res) {
  res.writeHead(303, {
    'Location': '/posts'
  });
  res.end();
}

function handleDelete(req, res) {
  switch (req.method) {
    case 'POST':
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      }).on('end', async () => {
        const params = new URLSearchParams(body);
        const id = params.get('id');

        //リクエストからワンタイムトークンを取得
        const requestedOneTimeToken = params.get('oneTimeToken');

        //ワンタイムトークンの判定式
        if(!(id && requestedOneTimeToken)){
          //ワンタイムトークンがなければ、BadRequest
          util.handleBadRequest(req, res);
        } else {

          //ワンタイムトークンが一致しているかどうかの判定
          if((oneTimeTokenMap.get(req.user) === requestedOneTimeToken)) {

              //idを元に、DBから投稿データ取得
              const post = await Post.findByPk(id);

              //ユーザーのチェック
              if(req.user === post.postedBy || req.user === 'admin'){
                await post.destroy();
                  console.info(
                    `削除されました: user: ${req.user}, ` +
                    `remoteAddress: ${req.socket.remoteAddress}, ` +
                    `userAgent: ${req.headers['user-agent']} `
                  );
                //ワンタイムトークンの削除
                oneTimeTokenMap.delete(req.user);
                handleRedirectPosts(req, res);
              } else {
                util.handleBadRequest(req, res);
              }
          }
        }
      });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}

module.exports = {
  handle,
  handleDelete
};
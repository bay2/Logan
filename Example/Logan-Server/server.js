/*
 * Copyright (c) 2018-present, 美团点评
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');
var path = require("path");  
var logPath = './log/'

const app = express();
app.timeout = 1000;


app.use(bodyParser.raw({
  type: 'binary/octet-stream',
  limit: '10mb'
}));

app.get('/', (req, res) => {
  res.send('Hello World!');
});

//递归创建目录 同步方法  
function mkdirsSync(dirname) {  
  //console.log(dirname);  
  if (fs.existsSync(dirname)) {  
      return true;  
  } else {  
      if (mkdirsSync(path.dirname(dirname))) {  
          fs.mkdirSync(dirname);  
          return true;  
      }  
  }  
}  


app.post('/logupload', (req, res) => {
  console.log('Logan client upload log file');
  if (!req.body) {
    return res.sendStatus(400);
  }

  logPath = './log/';

  const fileName = req.header('fileName');
  const filePath = req.header('filePath');
  logPath = logPath + filePath + '/';

  if (!fs.existsSync(logPath)) {
    mkdirsSync(logPath);
  }

  if (fs.existsSync(logPath + fileName + '.txt')) {
    fs.unlinkSync(logPath + fileName + '.txt');
  }
  // decode log
  decodeLog(req.body, 0, fileName);
  // haha
  console.log('decode log file complete');
  res.json({ success: true });
});

const decodeLog = (buf, skips, fileName) => {

  const logTxt = logPath + fileName + '.txt';
  const logGZ = logPath + fileName + '.gz';

  if (skips < buf.length) {
    const start = buf.readUInt8(skips);
    skips++;
    if (start == '1') {
      console.log('\nstart decode log file');
      const contentLen = (((buf.readUInt8(skips) & 0xFF) << 24) |
        ((buf.readUInt8(skips + 1) & 0xFF) << 16) |
        ((buf.readUInt8(skips + 2) & 0xFF) << 8) |
        (buf.readUInt8(skips + 3) & 0xFF));
      skips += 4;
      if (skips + contentLen > buf.length) {
        skips -= 4;
        decodeLog(buf, skips, fileName);
        return;
      }
      console.log('contentLen:' + contentLen);
      const content = buf.slice(skips, skips + contentLen);
      skips += contentLen;
      // decipher
      const decipher = crypto.createDecipheriv('aes-128-cbc', 'qvbccqwV3yQhxnTr', 'qvbccqwV3yQhxnTr');
      decipher.setAutoPadding(false);
      const decodedBuf = decipher.update(content);
      const finalBuf = decipher.final();
      const decoded = Buffer.concat([decodedBuf, finalBuf]);
      console.log('decrypt complete');
      // padding
      console.log('decoded length:', decoded.length);
      let padding1 = 0;
      let padding2 = 0;
      if (decoded.length > 0) {
        padding1 = decoded.readUInt8(decoded.length - 1);
        padding2 = decoded.readUInt8(decoded.length - 2);
      }
      
      let padding = 0;
      if (padding1 > 1 && padding1 === padding2) {
        padding = padding1;
      } else if (padding === 1) {
        padding = padding1;
      }
      const realContent = decoded.slice(0, decoded.length - padding);
      console.log('remove padding complete');
      // end
      if (skips + contentLen < buf.length && buf.readUInt8(skips) == '0') {
        skips++;
      }

      // flush
      let wstream = fs.createWriteStream(logGZ);
      wstream.write(realContent);
      wstream.end();
      wstream.on('finish', () => {
        // unzip
        const unzip = zlib.createGunzip();
        const inp = fs.createReadStream(logGZ);
        const gout = fs.createWriteStream(logTxt, { flags: 'a' });
        inp.pipe(unzip).on('error', (err) => {
          console.log(err);
          // unzip error, continue recursion
          fs.unlinkSync(logGZ)
          decodeLog(buf, skips, fileName);
        }).pipe(gout).on('finish', (src) => {
          console.log('write finish');
          // write complete, continue recursion
          fs.unlinkSync(logGZ)
          decodeLog(buf, skips, fileName);
        }).on('error', (err) => {
          console.log(err);
        });
      });
    } else {
      decodeLog(buf, skips, fileName);
    }
  }
};

app.listen(3000, () => console.log('Logan demo server listening on port 3000!'));
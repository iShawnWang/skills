#!/usr/bin/env node
/**
 * ShowDoc 文档获取脚本
 * 通过 ShowDoc API 获取页面内容 (page_content 已是 Markdown 格式)
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';

function fetchShowdocPage(apiUrl, pageId) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(apiUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const postData = `page_id=${encodeURIComponent(pageId)}`;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      rejectUnauthorized: false,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON 解析失败: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * 从 ShowDoc URL 中提取 API 地址和页面 ID
 * URL 格式: http://domain:port/web/#/cat_id/page_id
 */
function parseShowdocUrl(urlStr) {
  const url = new URL(urlStr);
  const domain = url.host;

  // hash 格式: #/cat_id/page_id，取末尾数字
  const match = url.hash.match(/\/(\d+)$/);
  if (!match) {
    throw new Error(`无法从 URL 中提取页面 ID: ${urlStr}`);
  }

  const pageId = match[1];
  const apiUrl = `http://${domain}/server/index.php?s=/api/page/info`;

  return { apiUrl, pageId };
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('用法: node fetch_page.mjs <showdoc_url>');
    console.error('   或: node fetch_page.mjs --api-url <url> --page-id <id>');
    process.exit(1);
  }

  let apiUrl, pageId;

  if (args[0].startsWith('http')) {
    const parsed = parseShowdocUrl(args[0]);
    apiUrl = parsed.apiUrl;
    pageId = parsed.pageId;
  } else if (args[0] === '--api-url') {
    apiUrl = args[1];
    const pageIdIdx = args.indexOf('--page-id');
    if (pageIdIdx === -1) {
      console.error('错误: 缺少 --page-id 参数');
      process.exit(1);
    }
    pageId = args[pageIdIdx + 1];
  } else {
    console.error('未知参数');
    process.exit(1);
  }

  try {
    const data = await fetchShowdocPage(apiUrl, pageId);
    
    if (data.error_code !== 0) {
      throw new Error(`API 错误: ${data.message || 'Unknown error'}`);
    }

    // data.data 就是 page 对象
    const content = data.data?.page_content;

    if (!content) {
      throw new Error('未获取到页面内容');
    }

    // page_content 已是 Markdown 格式，直接输出
    console.log(content);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();

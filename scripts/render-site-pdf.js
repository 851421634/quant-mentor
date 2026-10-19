/**
 * render-site-pdf.js
 *
 * 用法示例（在仓库根目录）:
 * 1. npm init -y
 * 2. npm install puppeteer js-yaml pdf-lib
 * 3. 确保已经运行： mkdocs build
 * 4. 启动静态服务器（另一个终端）：
 *      python -m http.server 8000 --directory site
 * 5. node scripts/render-site-pdf.js --config mkdocs.yml --docs-dir chapters --base http://localhost:8000 --out quant-mentor-styled.pdf
 *
 * 脚本会读取 mkdocs.yml 的 nav，按顺序访问每个页面 URL（基于 base），用 Puppeteer 打印每页为 PDF，然后合并为一本 PDF。
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { config: 'mkdocs.yml', docsDir: 'chapters', base: 'http://localhost:8000', out: 'site-book.pdf' };
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '');
      out[key] = args[i+1];
      i++;
    }
  }
  return out;
}

function flattenNavItem(item, outList) {
  if (typeof item === 'string') {
    outList.push(item);
  } else if (typeof item === 'object') {
    for (const k of Object.keys(item)) {
      const v = item[k];
      if (typeof v === 'string') outList.push(v);
      else if (Array.isArray(v)) v.forEach(sub => flattenNavItem(sub, outList));
    }
  }
}

function flattenNav(nav) {
  const files = [];
  nav.forEach(entry => flattenNavItem(entry, files));
  return files;
}

function relToUrl(rel) {
  // Normalize to forward-slash
  rel = rel.replace(/\\/g, '/');
  // Remove leading ./ if any
  rel = rel.replace(/^\.\//, '');
  if (rel.endsWith('index.md')) {
    const dir = path.posix.dirname(rel);
    if (dir === '.' || dir === '') return '/';
    return '/' + dir + '/';
  } else {
    const noext = rel.replace(/\.md$/i, '');
    return '/' + noext + '/';
  }
}

(async () => {
  const args = parseArgs();
  const cfgPath = path.resolve(args.config);
  if (!fs.existsSync(cfgPath)) {
    console.error('找不到 mkdocs 配置文件: ', cfgPath);
    process.exit(1);
  }
  const cfg = yaml.load(fs.readFileSync(cfgPath, 'utf8'));
  const nav = cfg.nav;
  if (!nav) {
    console.error('mkdocs.yml 中没有 nav 字段，无法按站点顺序抓取页面。');
    process.exit(1);
  }
  const relFiles = flattenNav(nav);
  const pageUrls = relFiles.map(rel => relToUrl(rel)).filter(Boolean);

  console.log('将按以下顺序渲染页面：');
  pageUrls.forEach(u => console.log('  ', u));

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });

  const tmpPdfBuffers = [];
  const base = args.base.replace(/\/$/, ''); // remove trailing slash

  for (let i = 0; i < pageUrls.length; i++) {
    const url = base + pageUrls[i];
    console.log(`渲染 (${i+1}/${pageUrls.length}): ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      // 给页面一点时间执行 JS（例如生成目录锚点等）
      await page.waitForTimeout(500);
      // 选择打印媒体（确保 print/屏幕样式按需）
      await page.emulateMediaType('screen');
      const pdfBuffer = await page.pdf({
        printBackground: true,
        format: 'A4',
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `<div style="font-size:10px; width:100%; text-align:center;">
                           第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页
                         </div>`
      });
      tmpPdfBuffers.push(pdfBuffer);
    } catch (err) {
      console.error('页面渲染失败: ', url, err);
    }
  }

  await browser.close();

  console.log('开始合并 PDF...');
  const mergedPdf = await PDFDocument.create();
  for (const buf of tmpPdfBuffers) {
    const pdf = await PDFDocument.load(buf);
    const copied = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copied.forEach(p => mergedPdf.addPage(p));
  }
  const mergedBytes = await mergedPdf.save();
  fs.writeFileSync(args.out, mergedBytes);
  console.log('合并完成，输出：', args.out);
})();

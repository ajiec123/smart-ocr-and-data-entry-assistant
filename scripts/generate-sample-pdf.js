const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 600, height: 800 });
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Courier New', monospace; font-size: 14px; margin: 20px; color: #111; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .row { display: flex; justify-content: space-between; margin: 4px 0; }
        hr { border: none; border-top: 1px dashed #333; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="center bold" style="font-size: 18px;">SUMMARECON BAKERY &amp; CAFE</div>
      <div class="center">JL. BOULEVARD BARU SUMMARECON</div>
      <div class="center">www.btdelivery.com</div>
      <div class="center">TELP: 021-4587890</div>
      <hr>
      <div class="row"><span>10 May 2019 16:32:47</span><span>KASIR: WINDA</span></div>
      <div class="row"><span>Check No: 3059689</span><span>DEBIT BCA</span></div>
      <hr>
      <div class="row"><span>1 Bread Butter Pudding</span><span>11,500</span></div>
      <div class="row"><span>1 Cream Bruille</span><span>14,000</span></div>
      <div class="row"><span>1 Choco Croissant</span><span>10,500</span></div>
      <div class="row"><span>1 Bank Of Chocolat</span><span>7,500</span></div>
      <hr>
      <div class="row"><span>Subtotal:</span><span>43,500</span></div>
      <div class="row bold" style="font-size: 16px;"><span>Total:</span><span>43,500</span></div>
      <div class="row"><span>Payment (Debit BCA):</span><span>43,500</span></div>
      <hr>
      <div class="center">THANK YOU FOR YOUR VISIT</div>
    </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  const pdfBuffer = await win.webContents.printToPDF({
    pageSize: 'A6',
    printBackground: true
  });

  const outDir = path.join(__dirname, '..', 'assets', 'samples');
  const outFile = path.join(outDir, 'sample_receipt.pdf');
  fs.writeFileSync(outFile, pdfBuffer);
  console.log('Sample PDF generated at:', outFile, `(${pdfBuffer.length} bytes)`);
  app.quit();
});

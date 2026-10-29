const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const samplesDir = path.join(__dirname, '..', 'assets', 'samples');
if (!fs.existsSync(samplesDir)) fs.mkdirSync(samplesDir, { recursive: true });

const samples = [
  {
    name: 'sample_indomaret.png',
    title: 'Indomaret Minimarket',
    svg: `
      <svg width="600" height="850" viewBox="0 0 600 850" xmlns="http://www.w3.org/2000/svg">
        <rect width="600" height="850" fill="#fdfbf7"/>
        <style>
          .mono { font-family: monospace; font-size: 16px; fill: #111111; }
          .bold { font-weight: bold; }
          .center { text-anchor: middle; }
          .right { text-anchor: end; }
        </style>
        <text x="300" y="45" class="mono bold center" font-size="22">PT INDOMARCO PRISMATAMA</text>
        <text x="300" y="75" class="mono center">INDOMARET CIPETE RAYA</text>
        <text x="300" y="100" class="mono center">JL. CIPETE RAYA NO. 15 JAKARTA</text>
        <text x="300" y="125" class="mono center">NPWP: 01.337.994.2-092.000</text>
        <line x1="30" y1="145" x2="570" y2="145" stroke="#333" stroke-dasharray="6,4" stroke-width="2"/>

        <text x="30" y="175" class="mono">28/10/2026 14:15</text>
        <text x="570" y="175" class="mono right">KASIR: RATNA</text>
        <text x="30" y="205" class="mono">NO. TRANSAKSI: IDM/20261028/9981</text>
        <line x1="30" y1="225" x2="570" y2="225" stroke="#333" stroke-dasharray="6,4" stroke-width="2"/>

        <!-- Items -->
        <text x="30" y="260" class="mono bold">SARI ROTI TAWAR KUPAS</text>
        <text x="40" y="285" class="mono">1 x 16.500</text>
        <text x="570" y="285" class="mono right">16.500</text>

        <text x="30" y="325" class="mono bold">INDOMILK UHT CHOCOLATE 1L</text>
        <text x="40" y="350" class="mono">2 x 18.000</text>
        <text x="570" y="350" class="mono right">36.000</text>

        <text x="30" y="390" class="mono bold">AQUA AIR MINERAL 600ML</text>
        <text x="40" y="415" class="mono">4 x 4.000</text>
        <text x="570" y="415" class="mono right">16.000</text>

        <text x="30" y="455" class="mono bold">MINYAK GORENG FILMA 2L</text>
        <text x="40" y="480" class="mono">1 x 35.000</text>
        <text x="570" y="480" class="mono right">35.000</text>

        <line x1="30" y1="510" x2="570" y2="510" stroke="#333" stroke-dasharray="6,4" stroke-width="2"/>

        <!-- Totals -->
        <text x="30" y="545" class="mono">SUBTOTAL</text>
        <text x="570" y="545" class="mono right">103.500</text>

        <text x="30" y="575" class="mono">PPN 11%</text>
        <text x="570" y="575" class="mono right">11.385</text>

        <text x="30" y="615" class="mono bold" font-size="19">TOTAL</text>
        <text x="570" y="615" class="mono bold right" font-size="19">114.885</text>

        <text x="30" y="650" class="mono">TUNAI</text>
        <text x="570" y="650" class="mono right">120.000</text>

        <text x="30" y="680" class="mono">KEMBALI</text>
        <text x="570" y="680" class="mono right">5.115</text>

        <line x1="30" y1="710" x2="570" y2="710" stroke="#333" stroke-dasharray="6,4" stroke-width="2"/>
        <text x="300" y="745" class="mono center">TERIMA KASIH TELAH BERBELANJA</text>
        <text x="300" y="775" class="mono center">LAYANAN KONSUMEN: 1500-280</text>
      </svg>
    `
  },
  {
    name: 'sample_kopikenangan.png',
    title: 'Kopi Kenangan Cafe',
    svg: `
      <svg width="600" height="800" viewBox="0 0 600 800" xmlns="http://www.w3.org/2000/svg">
        <rect width="600" height="800" fill="#fcfcfc"/>
        <style>
          .mono { font-family: monospace; font-size: 16px; fill: #111; }
          .bold { font-weight: bold; }
          .center { text-anchor: middle; }
          .right { text-anchor: end; }
        </style>
        <text x="300" y="50" class="mono bold center" font-size="24">KOPI KENANGAN</text>
        <text x="300" y="80" class="mono center">OUTLET GRAND INDONESIA</text>
        <text x="300" y="105" class="mono center">LANTAI 3A, JAKARTA PUSAT</text>
        <line x1="40" y1="130" x2="560" y2="130" stroke="#444" stroke-width="2"/>

        <text x="40" y="165" class="mono">2026-10-29 11:20</text>
        <text x="560" y="165" class="mono right">KASIR: ARIS</text>
        <text x="40" y="195" class="mono">STRUK NO: KK-882910</text>
        <text x="560" y="195" class="mono right">METODE: QRIS</text>
        <line x1="40" y1="215" x2="560" y2="215" stroke="#444" stroke-width="2"/>

        <text x="40" y="255" class="mono bold">ES KOPI KENANGAN MANTAN (L)</text>
        <text x="50" y="280" class="mono">2 x 22.000</text>
        <text x="560" y="280" class="mono right">44.000</text>

        <text x="40" y="320" class="mono bold">AVOCADO COFFEE JELLY</text>
        <text x="50" y="345" class="mono">1 x 28.000</text>
        <text x="560" y="345" class="mono right">28.000</text>

        <text x="40" y="385" class="mono bold">ROTI COKLAT KLASIK</text>
        <text x="50" y="410" class="mono">2 x 12.000</text>
        <text x="560" y="410" class="mono right">24.000</text>

        <line x1="40" y1="440" x2="560" y2="440" stroke="#444" stroke-width="2"/>

        <text x="40" y="475" class="mono">SUBTOTAL</text>
        <text x="560" y="475" class="mono right">96.000</text>

        <text x="40" y="505" class="mono">PB1 10%</text>
        <text x="560" y="505" class="mono right">9.600</text>

        <text x="40" y="535" class="mono">BIAYA LAYANAN</text>
        <text x="560" y="535" class="mono right">2.000</text>

        <text x="40" y="575" class="mono bold" font-size="20">TOTAL BAYAR</text>
        <text x="560" y="575" class="mono bold right" font-size="20">107.600</text>

        <line x1="40" y1="610" x2="560" y2="610" stroke="#444" stroke-width="2"/>
        <text x="300" y="650" class="mono center">SUDAH DIBAYAR LUNAS (QRIS)</text>
        <text x="300" y="680" class="mono center">IG: @KOPIKENANGAN.ID</text>
      </svg>
    `
  },
  {
    name: 'sample_apotek.png',
    title: 'Apotek Kimia Farma',
    svg: `
      <svg width="600" height="750" viewBox="0 0 600 750" xmlns="http://www.w3.org/2000/svg">
        <rect width="600" height="750" fill="#ffffff"/>
        <style>
          .mono { font-family: monospace; font-size: 16px; fill: #111; }
          .bold { font-weight: bold; }
          .center { text-anchor: middle; }
          .right { text-anchor: end; }
        </style>
        <text x="300" y="50" class="mono bold center" font-size="22">APOTEK KIMIA FARMA</text>
        <text x="300" y="80" class="mono center">UNIT TEBET TIMUR DALAM</text>
        <line x1="30" y1="110" x2="570" y2="110" stroke="#333" stroke-width="2"/>

        <text x="30" y="145" class="mono">2026-10-27 19:40</text>
        <text x="570" y="145" class="mono right">PETUGAS: ANITA</text>
        <text x="30" y="175" class="mono">FAKTUR NO: KF-091244</text>
        <text x="570" y="175" class="mono right">DEBIT BCA</text>
        <line x1="30" y1="195" x2="570" y2="195" stroke="#333" stroke-width="2"/>

        <text x="30" y="235" class="mono bold">PANADOL EXTRA RED 10S</text>
        <text x="40" y="260" class="mono">2 x 15.500</text>
        <text x="570" y="260" class="mono right">31.000</text>

        <text x="30" y="300" class="mono bold">CDR EFFERVESCENT ORANGE 10S</text>
        <text x="40" y="325" class="mono">1 x 54.000</text>
        <text x="570" y="325" class="mono right">54.000</text>

        <text x="30" y="365" class="mono bold">BETADINE ANTISEPTIC 30ML</text>
        <text x="40" y="390" class="mono">1 x 27.500</text>
        <text x="570" y="390" class="mono right">27.500</text>

        <line x1="30" y1="420" x2="570" y2="420" stroke="#333" stroke-width="2"/>

        <text x="30" y="455" class="mono">SUBTOTAL</text>
        <text x="570" y="455" class="mono right">112.500</text>

        <text x="30" y="485" class="mono">PPN 11%</text>
        <text x="570" y="485" class="mono right">12.375</text>

        <text x="30" y="525" class="mono bold" font-size="19">TOTAL AKHIR</text>
        <text x="570" y="525" class="mono bold right" font-size="19">124.875</text>

        <line x1="30" y1="560" x2="570" y2="560" stroke="#333" stroke-width="2"/>
        <text x="300" y="600" class="mono center">SEMOGA LEKAS SEMBUH</text>
      </svg>
    `
  }
];

async function generate() {
  console.log('Generating sample receipt images in assets/samples/...');
  for (const sample of samples) {
    const dest = path.join(samplesDir, sample.name);
    await sharp(Buffer.from(sample.svg)).png().toBuffer().then(buf => fs.writeFileSync(dest, buf));
    console.log(`  Created: ${sample.name} (${sample.title})`);
  }
  console.log('Sample generation completed successfully.\n');
}

generate().catch(console.error);

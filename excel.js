// Exportação XLSX local: pacote Open XML com células explicitamente textuais.
// Estrutura: https://learn.microsoft.com/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document
(() => {
  'use strict';
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const xml = valor => String(valor).replace(/_x[0-9a-f]{4}_/gi, m => '_x005F_' + m.slice(1))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, c => '_x' + c.charCodeAt(0).toString(16).padStart(4, '0') + '_')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
  function coluna(n) {
    let texto = '';
    for (n++; n; n = Math.floor((n - 1) / 26)) texto = String.fromCharCode(65 + (n - 1) % 26) + texto;
    return texto;
  }
  const tabelaCRC = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = (n >>> 1) ^ ((n & 1) ? 0xEDB88320 : 0);
    return n >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (const b of bytes) crc = (crc >>> 8) ^ tabelaCRC[(crc ^ b) & 255];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  // ZIP sem compressão, sem dependências externas ou chamadas a serviços.
  function zip(arquivos) {
    const encoder = new TextEncoder(), partes = [], diretorio = [];
    let posicao = 0, tamanhoDiretorio = 0;
    for (const [nome, conteudo] of Object.entries(arquivos)) {
      const nomeBytes = encoder.encode(nome), dados = encoder.encode(conteudo);
      const crc = crc32(dados);
      const local = new Uint8Array(30 + nomeBytes.length), l = new DataView(local.buffer);
      l.setUint32(0, 0x04034B50, true); l.setUint16(4, 20, true);
      l.setUint16(12, 33, true); // 01/01/1980
      l.setUint32(14, crc, true); l.setUint32(18, dados.length, true); l.setUint32(22, dados.length, true);
      l.setUint16(26, nomeBytes.length, true); local.set(nomeBytes, 30);
      const central = new Uint8Array(46 + nomeBytes.length), c = new DataView(central.buffer);
      c.setUint32(0, 0x02014B50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
      c.setUint16(14, 33, true); c.setUint32(16, crc, true);
      c.setUint32(20, dados.length, true); c.setUint32(24, dados.length, true);
      c.setUint16(28, nomeBytes.length, true); c.setUint32(42, posicao, true); central.set(nomeBytes, 46);
      partes.push(local, dados); diretorio.push(central);
      posicao += local.length + dados.length; tamanhoDiretorio += central.length;
      if (posicao + tamanhoDiretorio > 0xFFFFFFFF - 22) throw new Error('Arquivo grande demais. Selecione mais filtros.');
    }
    const fim = new Uint8Array(22), f = new DataView(fim.buffer);
    f.setUint32(0, 0x06054B50, true); f.setUint16(8, diretorio.length, true); f.setUint16(10, diretorio.length, true);
    f.setUint32(12, tamanhoDiretorio, true); f.setUint32(16, posicao, true);
    return new Blob([...partes, ...diretorio, fim], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  window.gerarExcel = (cabecalho, linhas) => {
    if (linhas.length > 1048575 || cabecalho.length > 16384) throw new Error('Quantidade acima do limite do Excel. Selecione mais filtros.');
    const todas = [cabecalho, ...linhas];
    const referencia = `A1:${coluna(cabecalho.length - 1)}${todas.length}`;
    const linhasXML = todas.map((linha, r) => `<row r="${r + 1}">` + linha.map((v, c) => {
      if (String(v).length > 32767) throw new Error('Um campo excede o limite de 32.767 caracteres do Excel.');
      return `<c r="${coluna(c)}${r + 1}" s="${r === 0 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join('') + '</row>').join('');
    return zip({
      '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="Indicadores" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml': `<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF14532D"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3F2E6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
      'xl/worksheets/sheet1.xml': `<worksheet xmlns="${ns}"><dimension ref="${referencia}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cabecalho.map((v, i) => `<col min="${i + 1}" max="${i + 1}" width="${i === 0 ? 20 : 42}" customWidth="1"/>`).join('')}</cols><sheetData>${linhasXML}</sheetData><autoFilter ref="${referencia}"/></worksheet>`
    });
  };
})();

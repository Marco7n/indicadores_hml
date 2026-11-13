(() => {
  'use strict';
  const config = window.SAUDE_BUCAL;
  window.CATALOGO_INDICADORES = Object.fromEntries(config.indicadores.map(i => [`${i.codigo} — ${i.titulo}`, ['Ação A']]));
  document.getElementById('painel-bucal').src = config.powerbi;
  // Somente para o mockup solicitado: reutiliza Ação A dos indicadores 1 a 6
  // da Saúde da Família, sem apresentar esses registros como dados bucais reais.
  window.prepararDadosBucal = origem => {
    const linhas = [];
    for (const linha of origem.linhas) {
      const numero = String(linha[origem.indicador]).match(/^([1-6])\./);
      if (!numero || !/^A\./.test(linha[origem.acao])) continue;
      const item = config.indicadores[Number(numero[1]) - 1];
      const nova = [...linha];
      nova[origem.indicador] = `${item.codigo} — ${item.titulo}`;
      nova[origem.acao] = 'Ação A';
      nova.push(linha[origem.indicador], linha[origem.acao], 'DEMONSTRAÇÃO: dados de Saúde da Família; não representam Saúde Bucal.');
      linhas.push(nova);
    }
    return { ...origem, linhas, cabecalho: [...origem.cabecalho, 'INDICADOR_ORIGEM', 'ACAO_ORIGEM', 'ORIGEM_DOS_DADOS'] };
  };
})();

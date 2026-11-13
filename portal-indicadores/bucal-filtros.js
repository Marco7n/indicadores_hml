(() => {
  'use strict';
  const unidade = document.getElementById('filtro-unidade');
  const indicador = document.getElementById('filtro-indicador');
  const acao = document.getElementById('filtro-acao');
  const baixar = document.getElementById('baixar-excel');
  const status = document.getElementById('download-status');
  let dados = null;
  let requisicao = 0;
  let controle;
  const cache = new Map();
  const validadeCache = 5 * 60 * 1000;
  const catalogo = window.CATALOGO_INDICADORES || {};

  // CSV de Sheets usa vírgulas; os arquivos locais usam ponto e vírgula.
  function lerCSV(texto) {
    texto = texto.replace(/^\uFEFF/, '');
    const primeiraLinha = texto.split(/\r?\n/, 1)[0];
    let aspas = false, virgulas = 0, pontos = 0;
    for (const c of primeiraLinha) {
      if (c === '"') aspas = !aspas;
      if (!aspas && c === ',') virgulas++;
      if (!aspas && c === ';') pontos++;
    }
    const separador = pontos > virgulas ? ';' : ',';
    const linhas = [];
    let linha = [], campo = '';
    aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (c === '"') {
        if (aspas && texto[i + 1] === '"') { campo += '"'; i++; }
        else aspas = !aspas;
      } else if (c === separador && !aspas) { linha.push(campo); campo = ''; }
      else if ((c === '\n' || c === '\r') && !aspas) {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        linha.push(campo);
        if (linha.some(v => v !== '')) linhas.push(linha);
        linha = []; campo = '';
      } else campo += c;
    }
    if (aspas) throw new Error('CSV com aspas incompletas.');
    linha.push(campo);
    if (linha.some(v => v !== '')) linhas.push(linha);
    return linhas;
  }
  const normalizar = valor => valor.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  function preencher(seletor, valores, todos) {
    seletor.replaceChildren(new Option(todos, ''));
    for (const valor of [...new Set(valores)].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))) {
      seletor.add(new Option(valor || '(Sem informação)', 'v:' + valor));
    }
  }
  function selecionado(seletor, valor) { return !seletor.value || seletor.value.slice(2) === valor; }
  function filtradas() {
    return dados.linhas.filter(linha => selecionado(indicador, linha[dados.indicador]) && selecionado(acao, linha[dados.acao]));
  }
  function contar() {
    if (!dados) return;
    const total = filtradas().length;
    baixar.disabled = total === 0;
    status.textContent = `${total.toLocaleString('pt-BR')} registro(s) para baixar.`;
  }
  function atualizarAcoes() {
    const valores = dados
      ? dados.linhas.filter(linha => selecionado(indicador, linha[dados.indicador])).map(linha => linha[dados.acao])
      : Object.entries(catalogo).filter(([nome]) => selecionado(indicador, nome)).flatMap(([, acoes]) => acoes);
    preencher(acao, valores, 'Todas as ações');
    contar();
  }
  function exibirDados(novos) {
    dados = novos;
    const escolhaIndicador = indicador.value, escolhaAcao = acao.value;
    const valoresIndicador = dados.linhas.map(linha => linha[dados.indicador]);
    if (escolhaIndicador) valoresIndicador.push(escolhaIndicador.slice(2));
    preencher(indicador, valoresIndicador, 'Todos os indicadores');
    indicador.value = escolhaIndicador;
    atualizarAcoes();
    if (escolhaAcao && !Array.from(acao.children).some(opcao => opcao.value === escolhaAcao)) {
      const valor = escolhaAcao.slice(2);
      acao.add(new Option(valor || '(Sem informação)', escolhaAcao));
    }
    acao.value = escolhaAcao;
    indicador.disabled = acao.disabled = false;
    contar();
  }
  preencher(indicador, [], 'Todos os indicadores');
  preencher(acao, [], 'Todas as ações');
  preencher(indicador, Object.keys(catalogo), 'Todos os indicadores');
  atualizarAcoes();
  const unidades = window.UNIDADES || [];
  for (const item of unidades) unidade.add(new Option(item.nome, String(item.id)));
  if (!unidades.length) status.textContent = 'Lista de unidades não encontrada. Verifique o arquivo unidades.js.';
  unidade.addEventListener('change', async () => {
    const atual = ++requisicao;
    if (controle) controle.abort();
    const escolhaAnterior = indicador.value;
    dados = null;
    indicador.disabled = acao.disabled = baixar.disabled = true;
    preencher(indicador, [], 'Todos os indicadores');
    preencher(acao, [], 'Todas as ações');
    const item = unidades.find(item => String(item.id) === unidade.value);
    if (!item) { status.textContent = 'Selecione uma unidade para carregar os filtros.'; return; }
    const chave = item.url || `indicadores_${item.id}.csv`;
    const anterior = cache.get(chave);
    if (anterior && Date.now() - anterior.instante < validadeCache) {
      cache.delete(chave);
      cache.set(chave, anterior);
      preencher(indicador, Object.keys(catalogo), 'Todos os indicadores');
      indicador.value = escolhaAnterior;
      exibirDados(anterior.dados);
      return;
    }
    cache.delete(chave);
    if (Object.keys(catalogo).length) {
      preencher(indicador, Object.keys(catalogo), 'Todos os indicadores');
      indicador.value = escolhaAnterior;
      atualizarAcoes();
      indicador.disabled = acao.disabled = false;
    }
    status.textContent = Object.keys(catalogo).length
      ? 'Você já pode escolher os filtros. Carregando os registros para liberar o Excel…'
      : 'Carregando os registros da unidade…';
    controle = new AbortController();
    try {
      const resposta = await fetch(chave, { signal: controle.signal, cache: 'no-cache', credentials: 'omit' });
      if (!resposta.ok) throw new Error('Falha ao carregar os dados.');
      const linhas = lerCSV(await resposta.text());
      if (atual !== requisicao) return;
      if (!linhas.length) throw new Error('CSV vazio.');
      const cabecalho = linhas.shift();
      const nomes = cabecalho.map(normalizar);
      const i = nomes.indexOf('INDICADOR'), a = nomes.indexOf('ACAO');
      if (i < 0 || a < 0 || linhas.some(linha => linha.length !== cabecalho.length)) throw new Error('Formato de CSV inesperado.');
      const novos = window.prepararDadosBucal({ cabecalho, linhas, indicador: i, acao: a });
      cache.set(chave, { dados: novos, instante: Date.now() });
      if (cache.size > 3) cache.delete(cache.keys().next().value);
      exibirDados(novos);
    } catch (erro) {
      if (atual !== requisicao) return;
      status.textContent = 'Não foi possível carregar os dados. Verifique a conexão, a publicação do CSV e a permissão de leitura pelo navegador. Selecione novamente a unidade para tentar de novo.';
      console.error('Download de indicadores:', erro);
    }
  });
  indicador.addEventListener('change', atualizarAcoes);
  acao.addEventListener('change', contar);
  baixar.addEventListener('click', () => {
    if (!dados || baixar.disabled) return;
    const linhas = filtradas();
    if (!linhas.length) return;
    let arquivo;
    try {
      arquivo = window.gerarExcel(dados.cabecalho, linhas);
    } catch (erro) {
      status.textContent = `Não foi possível gerar o Excel. ${erro.message}`;
      return;
    }
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DEMONSTRACAO_saude_bucal_${unidade.value}${indicador.value || acao.value ? '_filtrados' : ''}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
})();

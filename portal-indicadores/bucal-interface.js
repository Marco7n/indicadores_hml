(() => {
  const seletor = document.getElementById('filtro-indicador');
  const cards = Array.from(document.querySelectorAll('[data-indicador]'));
  const atualizar = () => cards.forEach(card => card.setAttribute('aria-pressed', String(seletor.value.startsWith('v:' + card.dataset.indicador + ' —'))));
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const codigo = card.dataset.indicador;
      const item = window.SAUDE_BUCAL.indicadores.find(i => i.codigo === codigo);
      const valor = `v:${codigo} — ${item.titulo}`;
      if (!Array.from(seletor.options).some(o => o.value === valor)) seletor.add(new Option(`${codigo} — ${item.titulo}`, valor));
      seletor.value = valor;
      seletor.dispatchEvent(new Event('change'));
      atualizar();
      document.getElementById('relatorios').scrollIntoView({behavior: 'smooth', block: 'center'});
    });
  });
  seletor.addEventListener('change', atualizar);
  document.getElementById('filtro-unidade').addEventListener('change', atualizar);
  atualizar();
})();

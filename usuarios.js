(() => {
    "use strict";

    const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfBumXkULNCppnuEpps1BfCAnzCzp9yswGH3_kADppxvlIDQTWINRLW6KYxfxAloYkfp3GRm5VeEVS/pub?output=csv";

    const condicoes = [
        ["Asma", "INDICADOR_ASMA"],
        ["AVC prévio", "INDICADOR_AVC"],
        ["Diabetes", "INDICADOR_4"],
        ["DPOC", "INDICADOR_DPOC"],
        ["Etilismo", "INDICADOR_ETILISMO"],
        ["Gestação", "GESTANTE"],
        ["Puérpera", "PUERPERA"],
        ["Hipertensão", "INDICADOR_5"],
        ["IAM prévio", "INDICADOR_IAM"],
        ["Insuficiência cardíaca", "INDICADOR_ICC"],
        ["Insuficiência renal crônica", "INDICADOR_RENAL"],
        ["Neoplasia", "INDICADOR_NEOPLASIA"],
        ["Obesidade", "INDICADOR_OBESIDADE"],
        ["Tabagismo", "INDICADOR_TABAGISMO"]
    ];

    const faixas = [
        [0, "Menores de 1 ano"],
        [1, "1 ano"],
        [4, "2 a 4 anos"],
        [9, "5 a 9 anos"],
        [14, "10 a 14 anos"],
        [19, "15 a 19 anos"],
        [24, "20 a 24 anos"],
        [29, "25 a 29 anos"],
        [39, "30 a 39 anos"],
        [49, "40 a 49 anos"],
        [59, "50 a 59 anos"],
        [69, "60 a 69 anos"],
        [79, "70 a 79 anos"],
        [Infinity, "80 anos ou mais"]
    ];

    const nomesCondicoes = condicoes.map(([nome]) => nome);
    const nomesFaixas = faixas.map(([, nome]) => nome);
    const ordemFaixas = faixas.map((_, i) => i).reverse();
    const numero = new Intl.NumberFormat("pt-BR");
    const hoje = new Date();
    const tamanhoLote = 100;

    const unidade = document.getElementById("filtro-unidade");
    const condicao = document.getElementById("filtro-condicao");
    const faixa = document.getElementById("filtro-faixa");
    const sexo = document.getElementById("filtro-sexo");
    const filtros = [unidade, condicao, faixa, sexo];
    const nomesSexos = { F: "Feminino", M: "Masculino", X: "Outro ou não informado" };
    const limpar = document.getElementById("limpar-filtros");
    const baixar = document.getElementById("baixar-excel");
    const totalCadastrados = document.getElementById("total-cadastrados");
    const totalCondicoes = document.getElementById("total-condicoes");
    const graficoCondicoes = document.getElementById("grafico-condicoes");
    const graficoFaixas = document.getElementById("grafico-faixas");
    const legendaSexoCondicoes = document.getElementById("legenda-sexo-condicoes");
    const legendaSexoFaixas = document.getElementById("legenda-sexo-faixas");
    const rolagem = document.getElementById("rolagem-lista");
    const corpo = document.getElementById("lista-cidadaos");
    const status = document.getElementById("status-lista");
    const origem = document.getElementById("origem-dados");

    if (origem) origem.hidden = true;

    let usuarios = [];
    let ordemCondicoes = [];
    let cadastradosFiltrados = [];
    let exibidos = 0;

    function* lerLinhasCSV(texto) {
        const primeiraLinha = texto.split(/\r\n|\n|\r/, 1)[0];
        const separador = primeiraLinha.includes(",") ? "," : ";";
        let linha = [];
        let campo = "";
        let aspas = false;

        for (let i = 0; i < texto.length; i++) {
            const c = texto[i];

            if (aspas) {
                if (c === '"' && texto[i + 1] === '"') {
                    campo += '"';
                    i++;
                } else if (c === '"') {
                    aspas = false;
                } else {
                    campo += c;
                }
            } else if (c === '"' && campo.trim() === "") {
                campo = "";
                aspas = true;
            } else if (c === separador) {
                linha.push(campo.trim());
                campo = "";
            } else if (c === "\n" || c === "\r") {
                linha.push(campo.trim());
                if (linha.some(Boolean)) yield linha;
                linha = [];
                campo = "";
                if (c === "\r" && texto[i + 1] === "\n") i++;
            } else {
                campo += c;
            }
        }

        if (aspas) throw new Error("O CSV termina com um campo entre aspas incompleto.");

        linha.push(campo.trim());
        if (linha.some(Boolean)) yield linha;
    }

    function calcularIdade(texto, tem60Mais) {
        const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
        const br = /^(\d{2})\/(\d{2})\/(\d{4}|\d{2})$/.exec(texto);
        if (!iso && !br) return null;

        let ano = Number(iso ? iso[1] : br[3]);
        const mes = Number(iso ? iso[2] : br[2]);
        const dia = Number(iso ? iso[3] : br[1]);
        const anoAtual = hoje.getFullYear();

        if (br && br[3].length === 2) {
            ano += Math.floor(anoAtual / 100) * 100;
            if (ano > anoAtual || tem60Mais) ano -= 100;
        }

        const nascimento = new Date(ano, mes - 1, dia);

        if (nascimento.getFullYear() !== ano ||
            nascimento.getMonth() !== mes - 1 ||
            nascimento.getDate() !== dia ||
            nascimento > hoje) {
            return null;
        }

        let idade = anoAtual - ano;

        if (hoje.getMonth() < mes - 1 ||
            (hoje.getMonth() === mes - 1 && hoje.getDate() < dia)) {
            idade--;
        }

        return idade;
    }

    function lerCSV(texto) {
        const linhas = lerLinhasCSV(texto.replace(/^\uFEFF/, ""));
        const cabecalho = linhas.next().value || [];
        const indices = new Map(cabecalho.map((nome, i) => [nome.toUpperCase(), i]));
        const obrigatorias = [
            "CIDADANIAID", "UNIDADEID", "DT_NASCIMENTO",
            ...condicoes.map(([, coluna]) => coluna)
        ];
        const faltam = obrigatorias.filter(coluna => !indices.has(coluna));

        if (faltam.length) {
            throw new Error("Colunas ausentes no CSV: " + faltam.join(", "));
        }

        const idxId = indices.get("CIDADANIAID");
        const idxUnidade = indices.get("UNIDADEID");
        const idxNascimento = indices.get("DT_NASCIMENTO");
        const idx60 = indices.get("INDICADOR_6");
        const idxSexo = indices.get("SEXO");
        const idxNome = indices.get("NOME");
        const idxCpf = indices.get("CPF");
        const idxCondicoes = condicoes.map(([, coluna]) => indices.get(coluna));
        const porId = new Map();
        let linha = 1;

        for (const campos of linhas) {
            linha++;

            if (campos.length !== cabecalho.length) {
                throw new Error("Quantidade de colunas inválida no registro " + linha + ".");
            }

            const id = campos[idxId];
            if (!id) continue;

            let pessoa = porId.get(id);

            if (!pessoa) {
                pessoa = {
                    id, nome: "", cpf: "", idade: null, faixa: -1, sexo: null,
                    unidades: new Set(), condicoes: new Set()
                };
                porId.set(id, pessoa);
            }

            pessoa.nome ||= campos[idxNome] || "";
            pessoa.cpf ||= campos[idxCpf] || "";

            if (campos[idxUnidade]) pessoa.unidades.add(campos[idxUnidade]);
            const sexoCSV = (campos[idxSexo] || "").toUpperCase();
            const codigoSexo = { FEMININO: "F", MASCULINO: "M", F: "F", M: "M" }[sexoCSV];
            if (codigoSexo) {
                if (pessoa.sexo === null) pessoa.sexo = codigoSexo;
                else if (pessoa.sexo !== codigoSexo) pessoa.sexo = "X";
            }


            if (pessoa.idade === null) {
                const tem60Mais = (campos[idx60] || "").toUpperCase() === "SIM";
                const idade = calcularIdade(campos[idxNascimento], tem60Mais);

                if (idade !== null) {
                    pessoa.idade = idade;
                    pessoa.faixa = faixas.findIndex(([limite]) => idade <= limite);
                }
            }

            idxCondicoes.forEach((indice, i) => {
                if (campos[indice].toUpperCase() === "SIM") pessoa.condicoes.add(i);
            });
        }

        return [...porId.values()];
    }

    function desenharBarras(grafico, nomes, contagem, select, ordem, porSexo, legenda, filtroSexo) {
        grafico.classList.toggle("sexo-feminino", filtroSexo === "F");
        grafico.classList.toggle("sexo-masculino", filtroSexo === "M");

        const mostrarPorSexo = !filtroSexo && (porSexo.F.some(Boolean) || porSexo.M.some(Boolean));
        legenda.hidden = !mostrarPorSexo;
        legenda.querySelector(".nota-sexo").hidden = !mostrarPorSexo
            || !contagem.some((total, i) => total > porSexo.F[i] + porSexo.M[i]);

        const maior = mostrarPorSexo ? Math.max(1, ...porSexo.F, ...porSexo.M) : Math.max(1, ...contagem);
        const foco = document.activeElement;
        const valorFocado = grafico.contains(foco) ? foco.value : null;
        const barras = document.createDocumentFragment();
        let novoFoco;

        for (const i of ordem) {
            const barra = document.createElement("button");
            barra.type = "button";
            barra.value = String(i);
            barra.className = "linha-barra";

            const ativa = select.value === barra.value;
            barra.classList.toggle("selecionada", ativa);
            barra.setAttribute("aria-pressed", String(ativa));

            barra.innerHTML = `
                <span class="categoria"></span>
                <span class="trilho-barra">
                    <span class="medida-barra">
                        <span class="preenchimento-barra"></span>
                        <span class="valor-barra"></span>
                    </span>
                </span>`;

            const categoria = barra.querySelector(".categoria");
            categoria.textContent = nomes[i];
            categoria.title = nomes[i];

            if (mostrarPorSexo) {
                const feminino = porSexo.F[i];
                const masculino = porSexo.M[i];
                const outros = contagem[i] - feminino - masculino;
                const trilho = barra.querySelector(".trilho-barra");
                trilho.className = "piramide-faixas";
                trilho.setAttribute("aria-hidden", "true");
                trilho.innerHTML = `
                    <span class="lado-piramide sexo-feminino">
                        <span>${numero.format(feminino)}</span>
                        <span class="barra-piramide" style="--proporcao: ${feminino / maior}"></span>
                    </span>
                    <span class="lado-piramide sexo-masculino">
                        <span class="barra-piramide" style="--proporcao: ${masculino / maior}"></span>
                        <span>${numero.format(masculino)}</span>
                    </span>`;
                const rotulo = nomes[i] + ": total " + numero.format(contagem[i])
                    + ", feminino " + numero.format(feminino) + ", masculino " + numero.format(masculino)
                    + ", outros ou não informados " + numero.format(outros);
                barra.title = rotulo;
                barra.setAttribute("aria-label", rotulo);
            } else {
                const largura = contagem[i] / maior * 100;
                barra.querySelector(".medida-barra").style.setProperty("--largura", largura + "%");
                barra.querySelector(".valor-barra").textContent = numero.format(contagem[i]);
            }

            barra.addEventListener("click", () => {
                select.value = select.value === barra.value ? "" : barra.value;
                aplicarFiltros();
            });

            if (barra.value === valorFocado) novoFoco = barra;
            barras.append(barra);
        }

        grafico.replaceChildren(barras);
        if (novoFoco) novoFoco.focus({ preventScroll: true });
    }

    function nomesDaPessoa(pessoa) {
        return nomesCondicoes.filter((_, i) => pessoa.condicoes.has(i)).join(", ");
    }

    function valoresDaPessoa(pessoa, vazio) {
        return [
            pessoa.nome || vazio, pessoa.cpf || vazio, pessoa.idade ?? vazio,
            nomesSexos[pessoa.sexo] || vazio, nomesDaPessoa(pessoa)
        ];
    }

    function desenharLista() {
        const fim = Math.min(exibidos + tamanhoLote, cadastradosFiltrados.length);
        const linhas = document.createDocumentFragment();

        for (let i = exibidos; i < fim; i++) {
            const pessoa = cadastradosFiltrados[i];
            const linha = document.createElement("tr");
            const valores = valoresDaPessoa(pessoa, "—");

            for (const valor of valores) {
                const celula = linha.insertCell();
                celula.textContent = valor;
                celula.title = String(valor);
            }

            linhas.append(linha);
        }

        corpo.append(linhas);
        exibidos = fim;
    }

    function aplicarFiltros() {
        const porCondicao = Array(condicoes.length).fill(0);
        const porFaixa = Array(faixas.length).fill(0);
        const faixasPorSexo = { F: Array(faixas.length).fill(0), M: Array(faixas.length).fill(0) };
        const condicoesPorSexo = { F: Array(condicoes.length).fill(0), M: Array(condicoes.length).fill(0) };
        const filtroUnidade = unidade.value;
        const filtroSexo = sexo.value;
        const filtroCondicao = condicao.value === "" ? -1 : Number(condicao.value);
        const filtroFaixa = faixa.value === "" ? -1 : Number(faixa.value);
        cadastradosFiltrados = [];
        let monitorados = 0;

        for (const pessoa of usuarios) {
            if (filtroUnidade && !pessoa.unidades.has(filtroUnidade)) continue;
            if (filtroCondicao !== -1 && !pessoa.condicoes.has(filtroCondicao)) continue;
            if (filtroFaixa !== -1 && pessoa.faixa !== filtroFaixa) continue;
            if (filtroSexo && (pessoa.sexo || "X") !== filtroSexo) continue;

            cadastradosFiltrados.push(pessoa);
            if (pessoa.faixa !== -1) {
                porFaixa[pessoa.faixa]++;
                if (faixasPorSexo[pessoa.sexo]) faixasPorSexo[pessoa.sexo][pessoa.faixa]++;
            }

            const condicoesDoSexo = condicoesPorSexo[pessoa.sexo];
            for (const i of pessoa.condicoes) {
                porCondicao[i]++;
                if (condicoesDoSexo) condicoesDoSexo[i]++;
            }

            if (pessoa.condicoes.size) monitorados++;
        }

        totalCadastrados.textContent = numero.format(cadastradosFiltrados.length);
        totalCondicoes.textContent = numero.format(monitorados);
        desenharBarras(graficoCondicoes, nomesCondicoes, porCondicao, condicao, ordemCondicoes,
            condicoesPorSexo, legendaSexoCondicoes, filtroSexo);
        desenharBarras(graficoFaixas, nomesFaixas, porFaixa, faixa, ordemFaixas,
            faixasPorSexo, legendaSexoFaixas, filtroSexo);

        corpo.replaceChildren();
        rolagem.scrollTop = 0;
        exibidos = 0;
        desenharLista();

        status.textContent = cadastradosFiltrados.length
            ? numero.format(cadastradosFiltrados.length) + " usuários na lista"
            : "Nenhum usuário cadastrado para os filtros selecionados.";

        limpar.disabled = !filtros.some(select => select.value);
        baixar.disabled = !filtroUnidade || !cadastradosFiltrados.length || typeof window.gerarExcel !== "function";

        if (typeof window.gerarExcel !== "function") {
            status.textContent += " · Gerador Excel indisponível. Confira excel.js.";
        }
    }

    async function carregarCSV() {
        status.textContent = "Carregando dados…";

        try {
            const resposta = await fetch(CSV_URL, { credentials: "omit" });

            if (!resposta.ok) {
                throw new Error("A fonte de dados respondeu com HTTP " + resposta.status + ".");
            }

            usuarios = lerCSV(await resposta.text());

            const nomes = new Map(
                (window.UNIDADES || []).map(item => [String(item.id), item.nome])
            );
            const unidadesPresentes = new Set();
            const sexosPresentes = new Set();
            const totaisCondicoes = Array(condicoes.length).fill(0);

            for (const pessoa of usuarios) {
                for (const id of pessoa.unidades) unidadesPresentes.add(id);
                sexosPresentes.add(pessoa.sexo || "X");
                for (const i of pessoa.condicoes) totaisCondicoes[i]++;
            }

            ordemCondicoes = condicoes.map((_, i) => i);
            ordemCondicoes.sort((a, b) => totaisCondicoes[b] - totaisCondicoes[a]
                || nomesCondicoes[a].localeCompare(nomesCondicoes[b], "pt-BR"));

            const opcoes = [...unidadesPresentes]
                .map(id => [id, nomes.get(id)?.trim()])
                .filter(([, nome]) => nome);
            opcoes.sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));

            unidade.options.length = 1;
            for (const [id, nome] of opcoes) unidade.add(new Option(nome, id));

            filtros.forEach(select => {
                select.value = "";
                select.disabled = false;
            });

            sexo.options.length = 1;
            sexo.disabled = !sexosPresentes.has("F") && !sexosPresentes.has("M");
            sexo.options[0].textContent = sexo.disabled ? "Sem dados na fonte" : "Todos";
            if (!sexo.disabled) {
                for (const [codigo, nome] of Object.entries(nomesSexos)) {
                    if (sexosPresentes.has(codigo)) sexo.add(new Option(nome, codigo));
                }
            }

            aplicarFiltros();
        } catch (erro) {
            status.textContent = "Não foi possível carregar os dados do painel.";
            console.error("Falha ao carregar o CSV:", erro);
        }
    }

    nomesCondicoes.forEach((nome, i) => condicao.add(new Option(nome, i)));
    for (const i of ordemFaixas) faixa.add(new Option(nomesFaixas[i], i));
    filtros.forEach(select => select.addEventListener("change", aplicarFiltros));

    limpar.addEventListener("click", () => {
        filtros.forEach(select => { select.value = ""; });
        aplicarFiltros();
    });

    rolagem.addEventListener("scroll", () => {
        const pertoDoFim = rolagem.scrollTop + rolagem.clientHeight >= rolagem.scrollHeight - 80;

        if (pertoDoFim && exibidos < cadastradosFiltrados.length) desenharLista();
    });

    baixar.addEventListener("click", () => {
        if (baixar.disabled) return;

        try {
            const linhas = cadastradosFiltrados.map(pessoa => valoresDaPessoa(pessoa, ""));
            const planilha = window.gerarExcel(["Nome", "CPF", "Idade", "Sexo", "Condições"], linhas);
            const url = URL.createObjectURL(planilha);
            const link = document.createElement("a");

            link.href = url;
            link.download = "populacao-estratificada.xlsx";
            link.click();

            setTimeout(() => URL.revokeObjectURL(url), 30000);
        } catch (erro) {
            status.textContent = "Falha ao gerar o Excel: " + erro.message;
            console.error(erro);
        }
    });

    carregarCSV();
})();
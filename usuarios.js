const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfBumXkULNCppnuEpps1BfCAnzCzp9yswGH3_kADppxvlIDQTWINRLW6KYxfxAloYkfp3GRm5VeEVS/pub?gid=298701850&single=true&output=csv";

const CONDICOES = [
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

const FAIXAS_ETARIAS = [
    "Menores de 1 ano", "1 ano", "2 a 4 anos", "5 a 9 anos",
    "10 a 14 anos", "15 a 19 anos", "20 a 24 anos", "25 a 29 anos",
    "30 a 39 anos", "40 a 49 anos", "50 a 59 anos", "60 a 69 anos",
    "70 a 79 anos", "80 anos ou mais"
];

let usuarios = [];
let paginaAtual = 1;
const ITENS_POR_PAGINA = 100;

function limparCampo(valor) {
    return (valor ?? "").trim().replace(/^"(.*)"$/, "$1").replace(/""/g, '"');
}

function calcularIdade(valor, indicador60Mais) {
    const texto = limparCampo(valor);
    let partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    let ano, mes, dia;

    if (partes) {
        ano = Number(partes[1]);
        mes = Number(partes[2]);
        dia = Number(partes[3]);
    } else {
        partes = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

        if (partes) {
            dia = Number(partes[1]);
            mes = Number(partes[2]);
            ano = Number(partes[3]);
        } else {
            partes = texto.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
            if (!partes) return null;

            dia = Number(partes[1]);
            mes = Number(partes[2]);

            const anoCurto = Number(partes[3]);
            const anoAtual = new Date().getFullYear();
            const seculoAtual = Math.floor(anoAtual / 100) * 100;
            const tem60Mais = limparCampo(indicador60Mais).toUpperCase() === "SIM";

            ano = anoCurto > anoAtual % 100 || tem60Mais
                ? seculoAtual - 100 + anoCurto
                : seculoAtual + anoCurto;
        }
    }

    const nascimento = new Date(ano, mes - 1, dia);
    if (nascimento.getFullYear() !== ano ||
        nascimento.getMonth() !== mes - 1 ||
        nascimento.getDate() !== dia) {
        return null;
    }

    const hoje = new Date();
    let idade = hoje.getFullYear() - ano;

    if (hoje.getMonth() < mes - 1 ||
        (hoje.getMonth() === mes - 1 && hoje.getDate() < dia)) {
        idade--;
    }

    return idade >= 0 ? idade : null;
}

function obterFaixaEtaria(idade) {
    if (idade === null) return null;
    if (idade < 1) return "Menores de 1 ano";
    if (idade === 1) return "1 ano";
    if (idade <= 4) return "2 a 4 anos";
    if (idade <= 9) return "5 a 9 anos";
    if (idade <= 14) return "10 a 14 anos";
    if (idade <= 19) return "15 a 19 anos";
    if (idade <= 24) return "20 a 24 anos";
    if (idade <= 29) return "25 a 29 anos";
    if (idade <= 39) return "30 a 39 anos";
    if (idade <= 49) return "40 a 49 anos";
    if (idade <= 59) return "50 a 59 anos";
    if (idade <= 69) return "60 a 69 anos";
    if (idade <= 79) return "70 a 79 anos";
    return "80 anos ou mais";
}

async function carregarCSV() {
    const resposta = await fetch(CSV_URL);
    if (!resposta.ok) throw new Error("Falha ao carregar a planilha.");

    const csv = await resposta.text();
    const linhas = csv.trim().split(/\r?\n/);
    const cabecalho = linhas.shift().replace(/^\uFEFF/, "");
    const colunas = cabecalho.split(",").map(limparCampo);
    const indices = Object.fromEntries(colunas.map((nome, i) => [nome, i]));

    const indiceId = indices.CIDADANIAID;
    const indiceNascimento = indices.DT_NASCIMENTO;
    const indice60Mais = indices.INDICADOR_6;

    if (indiceId === undefined) throw new Error("Coluna CIDADANIAID não encontrada.");
    if (indiceNascimento === undefined) throw new Error("Coluna DT_NASCIMENTO não encontrada.");
    if (indice60Mais === undefined) throw new Error("Coluna INDICADOR_6 não encontrada.");

    const colunasCondicoes = CONDICOES.map(([nome, coluna]) => {
        if (indices[coluna] === undefined) {
            throw new Error(`Coluna não encontrada no CSV: ${coluna}`);
        }
        return [nome, indices[coluna]];
    });

    const ids = new Set();
    const idsComCondicoes = new Set();
    const contagens = new Map(CONDICOES.map(([nome]) => [nome, 0]));
    const contagensFaixas = new Map(FAIXAS_ETARIAS.map(nome => [nome, 0]));

    usuarios = [];
    paginaAtual = 1;

    for (const linha of linhas) {
        if (!linha) continue;

        const valores = linha.split(",").map(limparCampo);
        const id = valores[indiceId];

        if (!id || ids.has(id)) continue;
        ids.add(id);

        const idade = calcularIdade(
            valores[indiceNascimento],
            valores[indice60Mais]
        );
        const faixa = obterFaixaEtaria(idade);

        if (faixa) {
            contagensFaixas.set(faixa, contagensFaixas.get(faixa) + 1);
        }

        let temCondicao = false;
        const condicoesPessoa = [];

        for (const [nome, indice] of colunasCondicoes) {
            if (valores[indice]?.toUpperCase() === "SIM") {
                contagens.set(nome, contagens.get(nome) + 1);
                temCondicao = true;
                condicoesPessoa.push(nome);
            }
        }

        if (temCondicao) {
            idsComCondicoes.add(id);
            usuarios.push({
                id,
                idade: idade ?? "—",
                condicoes: condicoesPessoa.join(", ")
            });
        }
    }

    document.querySelector("#total-cadastrados").textContent =
        ids.size.toLocaleString("pt-BR");

    document.querySelector("#total-condicoes").textContent =
        idsComCondicoes.size.toLocaleString("pt-BR");

    const dadosCondicoes = [...contagens]
        .map(([nome, quantidade]) => ({ nome, quantidade }))
        .sort((a, b) => b.quantidade - a.quantidade);

    const dadosFaixas = FAIXAS_ETARIAS
        .map(nome => ({ nome, quantidade: contagensFaixas.get(nome) }));

    renderizarBarras("#grafico-condicoes", dadosCondicoes, "condicao");
    renderizarBarras("#grafico-faixas", dadosFaixas, "faixa");
    renderizarLista();
}

function renderizarBarras(seletor, dados, tipo) {
    const grafico = document.querySelector(seletor);
    const maiorValor = Math.max(...dados.map(item => item.quantidade), 1);

    grafico.classList.add("grafico-barras");
    grafico.innerHTML = dados.map(item => `
        <div class="linha-barra" data-${tipo}="${item.nome}">
            <span class="categoria">${item.nome}</span>
            <div class="trilho-barra">
                <div class="preenchimento-barra"
                     style="width: ${item.quantidade / maiorValor * 100}%"></div>
            </div>
            <span class="valor-barra">${item.quantidade.toLocaleString("pt-BR")}</span>
        </div>
    `).join("");
}

function renderizarLista() {
    const corpo = document.querySelector("#lista-cidadaos");
    const totalPaginas = Math.max(1, Math.ceil(usuarios.length / ITENS_POR_PAGINA));
    paginaAtual = Math.min(paginaAtual, totalPaginas);

    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const pagina = usuarios.slice(inicio, inicio + ITENS_POR_PAGINA);

    corpo.innerHTML = pagina.map(usuario => `
        <tr>
            <td>${usuario.id}</td>
            <td>${usuario.idade}</td>
            <td>${usuario.condicoes}</td>
        </tr>
    `).join("");

    document.querySelector("#pagina-status").textContent =
        `Página ${paginaAtual} de ${totalPaginas}`;
    document.querySelector("#pagina-anterior").disabled = paginaAtual === 1;
    document.querySelector("#pagina-proxima").disabled = paginaAtual === totalPaginas;
}

document.querySelector("#pagina-anterior").addEventListener("click", () => {
    if (paginaAtual > 1) {
        paginaAtual--;
        renderizarLista();
    }
});

document.querySelector("#pagina-proxima").addEventListener("click", () => {
    const totalPaginas = Math.ceil(usuarios.length / ITENS_POR_PAGINA);
    if (paginaAtual < totalPaginas) {
        paginaAtual++;
        renderizarLista();
    }
});

carregarCSV().catch(erro => console.error(erro));
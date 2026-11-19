const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfBumXkULNCppnuEpps1BfCAnzCzp9yswGH3_kADppxvlIDQTWINRLW6KYxfxAloYkfp3GRm5VeEVS/pub?gid=298701850&single=true&output=csv";

async function carregarDados() {
    const resposta = await fetch(CSV_URL);

    if (!resposta.ok) {
        throw new Error("Não consegui carregar a planilha.");
    }

    const csv = await resposta.text();
    console.log("Cabeçalho do CSV:", csv.split(/\r?\n/, 1)[0]);
}

carregarDados().catch(erro => console.error(erro));
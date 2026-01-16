const axios = require('axios');
const pdf = require('pdf-parse');
const fs = require('fs');

async function downloadAndExtract() {
    const url = "https://www.meteoromania.ro/Upload-Produse/nivologie/nivologie.pdf";
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const data = await pdf(response.data);
        // Salvează doar textul extras
        fs.writeFileSync('date_meteo.txt', data.text);
        console.log("Succes! Textul a fost extras.");
    } catch (error) {
        console.error("Eroare:", error);
        process.exit(1);
    }
}
downloadAndExtract();

const axios = require('axios');
const PDFParser = require("pdf2json");
const fs = require('fs');

async function downloadAndExtract() {
    const url = "https://www.meteoromania.ro/Upload-Produse/nivologie/nivologie.pdf";
    
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const pdfParser = new PDFParser(this, 1);

        pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError));
        pdfParser.on("pdfParser_dataReady", pdfData => {
            const rawText = pdfParser.getRawTextContent();
            fs.writeFileSync('date_meteo.txt', rawText);
            console.log("Succes! Textul a fost extras în date_meteo.txt");
        });

        pdfParser.parseBuffer(response.data);
    } catch (error) {
        console.error("Eroare la descarcare:", error);
        process.exit(1);
    }
}

downloadAndExtract();

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
            let rawText = pdfParser.getRawTextContent();
            
            // CURĂȚARE: Eliminăm caracterele de control și decodăm URL-urile
            let cleanText = decodeURIComponent(rawText)
                .replace(/\r\n/g, " ")
                .replace(/%20/g, " ")
                .replace(/\s+/g, " ");

            fs.writeFileSync('date_meteo.txt', cleanText);
            console.log("Succes! Text curățat salvat.");
        });

        pdfParser.parseBuffer(response.data);
    } catch (error) {
        process.exit(1);
    }
}
downloadAndExtract();

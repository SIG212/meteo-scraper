const axios = require('axios');
const PDFParser = require("pdf2json");
const fs = require('fs');

async function downloadAndExtract() {
    const url = "https://www.meteoromania.ro/Upload-Produse/nivologie/nivologie.pdf";
    
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const pdfParser = new PDFParser(this, 1);

        pdfParser.on("pdfParser_dataReady", pdfData => {
            let rawText = decodeURIComponent(pdfParser.getRawTextContent())
                .replace(/\s+/g, " ");

            const masive = {
                "fagaras": "MUNȚII FĂGĂRAȘ",
                "bucegi": "MUNȚII BUCEGI",
                "rodnei": "MASIVELE RODNEI",
                "ceahlau": "MASIVUL CEAHLĂU",
                "occidentali": "CARPAȚII OCCIDENTALI"
            };

            let rezultate = {
                ultima_actualizare: new Date().toISOString(),
                date: {}
            };

            for (let id in masive) {
                let numePDF = masive[id];
                let startPos = rawText.indexOf(numePDF);
                
                if (startPos !== -1) {
                    // Tăiem o bucată de text relevantă pentru acest masiv
                    let section = rawText.substring(startPos, startPos + 2500);
                    
                    rezultate.date[id] = {
                        peste_1800: extractRisc(section, "Peste 1800 m"),
                        sub_1800: extractRisc(section, "Sub 1800 m")
                    };
                }
            }

            fs.writeFileSync('date_meteo.json', JSON.stringify(rezultate, null, 2));
            console.log("JSON Smart generat cu succes!");
        });

        pdfParser.parseBuffer(response.data);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

function extractRisc(section, altitudine) {
    // 1. Încercăm să izolăm fragmentul de altitudine
    let regex = new RegExp(altitudine + ":(.*?)(?:Sub 1800 m|Page|----------------|$)", "i");
    let match = section.match(regex);
    let fragment = match ? match[1] : "";

    // 2. Căutăm cifra riscului (1-5) în fragmentul de altitudine
    let riscMatch = fragment.match(/risc\s*.*?\s*\(?([1-5])\)?/i);
    let nivel = riscMatch ? parseInt(riscMatch[1]) : 0;

    // 3. Dacă nu am găsit (nivel 0), căutăm în toată secțiunea (pentru cazurile unde e scris la început)
    if (nivel === 0) {
        let generalRiskMatch = section.match(/RISC\s*([1-5])/i);
        nivel = generalRiskMatch ? parseInt(generalRiskMatch[1]) : 0;
    }
    
    const labels = ["Necunoscut", "Scăzut", "Moderat", "Însemnat", "Ridicat", "Foarte ridicat"];
    
    return {
        nivel: nivel,
        text: labels[nivel],
        descriere: fragment.length > 5 ? fragment.trim().substring(0, 250) + "..." : "Vezi prognoza generală a masivului."
    };
}
downloadAndExtract();

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
                "rodnei": "RODNEI",
                "bistritei": "BISTRIȚEI",
                "calimani": "CĂLIMANI",
                "ceahlau": "CEAHLĂU",
                "fagaras": "FĂGĂRAȘ",
                "bucegi": "BUCEGI",
                "parang": "PARÂNG",
                "sureanu": "ȘUREANU",
                "tarcu": "ȚARCU",
                "godeanu": "GODEANU",
                "vladeasa": "VLĂDEASA",
                "muntele_mare": "MUNTELE MARE",
                "gilau": "GILĂU",
                "occidentali": "OCCIDENTALI"
            };

            let rezultate = {
                ultima_actualizare: new Date().toISOString(),
                date: {}
            };

            for (let id in masive) {
                let cuvantCautat = masive[id];
                // Căutăm cuvântul indiferent de litere mari/mici
                let regexBusca = new RegExp(cuvantCautat, "i");
                let matchPos = rawText.search(regexBusca);
                
                if (matchPos !== -1) {
                    // Luăm o bucată de 2500 caractere din jurul cuvântului găsit
                    // pentru a fi siguri că prindem și riscul care poate fi deasupra sau dedesubt
                    let startPoint = Math.max(0, matchPos - 500);
                    let section = rawText.substring(startPoint, startPos + 2500);
                    
                    rezultate.date[id] = {
                        peste_1800: extractRiscOnly(section, "Peste 1800 m"),
                        sub_1800: extractRiscOnly(section, "Sub 1800 m")
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

    };
}
downloadAndExtract();

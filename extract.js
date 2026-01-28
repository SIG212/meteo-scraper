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
            
            const MOUNTAIN_MAPPINGS = {
                "rodnei": ["RODNEI", "ORIENTALI"],
                "bistritei": ["BISTRIȚEI", "ORIENTALI"],
                "calimani": ["CĂLIMANI", "ORIENTALI"],
                "ceahlau": ["CEAHLĂU", "ORIENTALI"],
                "fagaras": ["FĂGĂRAȘ", "MERIDIONALI"],
                "bucegi": ["BUCEGI", "MERIDIONALI"],
                "parang": ["PARÂNG", "MERIDIONALI"],
                "sureanu": ["ȘUREANU", "MERIDIONALI"],
                "tarcu": ["ȚARCU", "MERIDIONALI"],
                "godeanu": ["GODEANU", "MERIDIONALI"],
                "vladeasa": ["VLĂDEASA", "OCCIDENTALI"],
                "muntele_mare": ["MUNTELE MARE", "OCCIDENTALI"],
                "gilau": ["GILĂU", "OCCIDENTALI"],
                "occidentali": ["OCCIDENTALI"],
                "orientali": ["ORIENTALI"],
                "meridionali": ["MERIDIONALI"]
            };
            
            let rezultate = {
                ultima_actualizare: new Date().toISOString(),
                date: {}
            };
            
            for (let id in MOUNTAIN_MAPPINGS) {
                const searchTerms = MOUNTAIN_MAPPINGS[id];
                let found = false;
                
                // Încearcă fiecare termen din array până găsește unul
                for (const cuvantCautat of searchTerms) {
                    let regexBusca = new RegExp(cuvantCautat, "i");
                    let matchPos = rawText.search(regexBusca);
                    
                    if (matchPos !== -1) {
                        let startPoint = Math.max(0, matchPos - 500);
                        let section = rawText.substring(startPoint, matchPos + 2500);
                        
                        rezultate.date[id] = {
                            sursa: cuvantCautat, // Arată ce termen a găsit
                            fallback: cuvantCautat !== searchTerms[0], // true dacă nu e prima opțiune
                            peste_1800: extractRiscOnly(section, "Peste 1800 m"),
                            sub_1800: extractRiscOnly(section, "Sub 1800 m")
                        };
                        found = true;
                        break; // Oprește căutarea, am găsit
                    }
                }
                
                if (!found) {
                    console.log(`Nu am găsit date pentru: ${id}`);
                }
            }
            
            fs.writeFileSync('date_meteo.json', JSON.stringify(rezultate, null, 2));
            console.log("Succes! JSON generat corect.");
        });
        
        pdfParser.parseBuffer(response.data);
    } catch (error) {
        console.error("Eroare:", error.message);
        process.exit(1);
    }
}

function extractRiscOnly(section, altitudine) {
    let regex = new RegExp(altitudine + ":(.*?)(?:Sub 1800 m|Page|----------------|$)", "i");
    let match = section.match(regex);
    let fragment = match ? match[1] : "";
    
    let riscMatch = fragment.match(/risc\s*.*?\s*\(?([1-5])\)?/i);
    let nivel = riscMatch ? parseInt(riscMatch[1]) : 0;
    
    if (nivel === 0) {
        let generalRiskMatch = section.match(/RISC\s*([1-5])/i);
        nivel = generalRiskMatch ? parseInt(generalRiskMatch[1]) : 0;
    }
    
    const labels = ["Necunoscut", "Scăzut", "Moderat", "Însemnat", "Ridicat", "Foarte ridicat"];
    return {
        nivel: nivel,
        text: labels[nivel]
    };
}

downloadAndExtract();

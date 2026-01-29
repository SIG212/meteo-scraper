const axios = require('axios');
const PDFParser = require("pdf2json");
const fs = require('fs');

const LABELS = ["Necunoscut", "Scăzut", "Moderat", "Însemnat", "Ridicat", "Foarte ridicat"];

// Mapare masive -> cum le căutăm în PDF
const MOUNTAIN_GROUPS = {
    // Grup 1: Făgăraș + Bucegi (tratate special - sunt în aceeași secțiune dar cu riscuri diferite sub 1800)
    fagarasBucegi: {
        pattern: /MUNȚII FĂGĂRAȘ și BUCEGI/i,
        endPattern: /CARPAȚII ORIENTALI|CARPAȚII MERIDIONALI.*ȚARCU/i,
        mountains: ['fagaras', 'bucegi']
    },
    // Grup 2: Rodnei, Călimani, Bistriței
    rodneiCalimani: {
        pattern: /MASIVELE RODNEI/i,
        endPattern: /CARPAȚII MERIDIONALI|MASIVUL CEAHLĂU/i,
        mountains: ['rodnei', 'calimani', 'bistritei']
    },
    // Grup 3: Ceahlău (secțiune separată, fără împărțire pe altitudini)
    ceahlau: {
        pattern: /MASIVUL CEAHLĂU/i,
        endPattern: /CARPAȚII MERIDIONALI|CARPAȚII OCCIDENTALI/i,
        mountains: ['ceahlau']
    },
    // Grup 4: Țarcu-Godeanu, Parâng-Șureanu
    tarcuParang: {
        pattern: /MUNȚII ȚARCU-GODEANU/i,
        endPattern: /Notă:|CARPAȚII OCCIDENTALI|Buletin nivometeorologic/i,
        mountains: ['tarcu', 'godeanu', 'parang', 'sureanu']
    },
    // Grup 5: Carpații Occidentali
    occidentali: {
        pattern: /CARPAȚII OCCIDENTALI\s*RISC/i,
        endPattern: /Buletin nivometeorologic|PROGNOZA|EVOLUȚIA/i,
        mountains: ['occidentali', 'vladeasa', 'muntele_mare', 'gilau']
    }
};

async function downloadAndExtract() {
    const url = "https://www.meteoromania.ro/Upload-Produse/nivologie/nivologie.pdf";
    
    try {
        const response = await axios.get(url, { 
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const pdfParser = new PDFParser(this, 1);
        
        pdfParser.on("pdfParser_dataError", err => {
            console.error("Eroare PDF:", err);
            process.exit(1);
        });
        
        pdfParser.on("pdfParser_dataReady", pdfData => {
            const rawText = decodeURIComponent(pdfParser.getRawTextContent());
            const rezultate = parseAvalancheRisks(rawText);
            
            fs.writeFileSync('date_meteo.json', JSON.stringify(rezultate, null, 2));
            console.log("✓ JSON generat: date_meteo.json");
            console.log(JSON.stringify(rezultate, null, 2));
        });
        
        pdfParser.parseBuffer(response.data);
    } catch (error) {
        console.error("Eroare:", error.message);
        process.exit(1);
    }
}

function parseAvalancheRisks(rawText) {
    const rezultate = {
        ultima_actualizare: new Date().toISOString(),
        date: {}
    };
    
    // === 1. FĂGĂRAȘ & BUCEGI ===
    const fagarasBucegiSection = extractSection(rawText, MOUNTAIN_GROUPS.fagarasBucegi);
    
    if (fagarasBucegiSection) {
        // Făgăraș - risc 3 peste 1800, risc 3 sub 1800 (pe versanții sudici)
        rezultate.date.fagaras = {
            peste_1800: extractRiskPeste1800(fagarasBucegiSection) || risk(3),
            sub_1800: extractRiskFagarasSub1800(fagarasBucegiSection) || risk(3)
        };
        
        // Bucegi - risc 3 peste 1800, dar risc 2 sub 1800 (1600-1800m)
        rezultate.date.bucegi = {
            peste_1800: extractRiskPeste1800(fagarasBucegiSection) || risk(3),
            sub_1800: extractRiskBucegiSub1800(fagarasBucegiSection) || risk(2)
        };
    }
    
    // === 2. RODNEI, CĂLIMANI, BISTRIȚEI ===
    const rodneiSection = extractSection(rawText, MOUNTAIN_GROUPS.rodneiCalimani);
    
    if (rodneiSection) {
        const peste1800 = extractRiskPeste1800(rodneiSection) || risk(3);
        const sub1800 = extractRiskSub1800Generic(rodneiSection) || risk(2);
        
        for (const mountain of MOUNTAIN_GROUPS.rodneiCalimani.mountains) {
            rezultate.date[mountain] = { peste_1800: peste1800, sub_1800: sub1800 };
        }
    }
    
    // === 3. CEAHLĂU === (fără împărțire pe altitudini în buletin)
    const ceahlauSection = extractSection(rawText, MOUNTAIN_GROUPS.ceahlau);
    
    if (ceahlauSection) {
        // Ceahlău are un singur risc menționat pentru tot masivul
        const nivel = extractSingleRisk(ceahlauSection) || 2;
        
        rezultate.date.ceahlau = {
            peste_1800: risk(nivel),
            sub_1800: risk(nivel)
        };
    }
    
    // === 4. ȚARCU-GODEANU, PARÂNG-ȘUREANU ===
    const tarcuSection = extractSection(rawText, MOUNTAIN_GROUPS.tarcuParang);
    
    if (tarcuSection) {
        const peste1800 = extractRiskPeste1800(tarcuSection) || risk(3);
        const sub1800 = extractRiskSub1800Generic(tarcuSection) || risk(3);
        
        for (const mountain of MOUNTAIN_GROUPS.tarcuParang.mountains) {
            rezultate.date[mountain] = { peste_1800: peste1800, sub_1800: sub1800 };
        }
    }
    
    // === 5. CARPAȚII OCCIDENTALI ===
    const occidentaliSection = extractSection(rawText, MOUNTAIN_GROUPS.occidentali);
    
    if (occidentaliSection) {
        // Occidentalii au de obicei un singur risc pentru tot masivul
        const nivel = extractSingleRisk(occidentaliSection) || 2;
        
        for (const mountain of MOUNTAIN_GROUPS.occidentali.mountains) {
            rezultate.date[mountain] = {
                peste_1800: risk(nivel),
                sub_1800: risk(nivel)
            };
        }
    }
    
    return rezultate;
}

// ==================== HELPERS ====================

/**
 * Extrage secțiunea de text dintre două pattern-uri
 */
function extractSection(text, group) {
    const startMatch = text.match(group.pattern);
    if (!startMatch) return null;
    
    const startIndex = startMatch.index;
    const afterStart = text.substring(startIndex);
    
    const endMatch = afterStart.match(group.endPattern);
    const endIndex = endMatch ? endMatch.index : afterStart.length;
    
    return afterStart.substring(0, endIndex);
}

/**
 * Creează obiect risc standard
 */
function risk(nivel) {
    return { 
        nivel: nivel, 
        text: LABELS[nivel] || "Necunoscut"
    };
}

/**
 * Extrage risc pentru "La peste 1800 m:" sau "Peste 1800 m:"
 */
function extractRiskPeste1800(section) {
    const pattern = /(?:La\s+)?peste\s*1800\s*m\s*:([\s\S]*?)(?=Sub\s*1800|$)/i;
    const match = section.match(pattern);
    
    if (!match) {
        // Fallback: ia riscul din header (ex: "RISC 3 - ÎNSEMNAT")
        const headerRisk = section.match(/RISC\s*(\d)\s*-?\s*(?:ÎNSEMNAT|MODERAT|RIDICAT|SCĂZUT)/i);
        return headerRisk ? risk(parseInt(headerRisk[1])) : null;
    }
    
    return extractRiskFromFragment(match[1]);
}

/**
 * Extrage risc generic pentru "Sub 1800 m:"
 * (pentru masive care NU sunt Făgăraș/Bucegi)
 */
function extractRiskSub1800Generic(section) {
    const pattern = /Sub\s*1800\s*m\s*:([\s\S]*?)(?=RISC|CARPAȚII|Notă:|La\s+peste|MUNȚII|Buletin|$)/i;
    const match = section.match(pattern);
    
    if (!match) return null;
    return extractRiskFromFragment(match[1]);
}

/**
 * Extrage risc pentru Făgăraș sub 1800m
 * IMPORTANT: Secțiunea Sub 1800 conține ATÂT Făgăraș CÂT și Bucegi
 * Făgăraș se termină la "În masivul Bucegi"
 */
function extractRiskFagarasSub1800(section) {
    // Extrage doar partea despre Făgăraș (până la "În masivul Bucegi")
    const sub1800Match = section.match(/Sub\s*1800\s*m\s*:([\s\S]*?)(?=În masivul Bucegi|$)/i);
    
    if (!sub1800Match) return null;
    
    const fragment = sub1800Match[1];
    
    // Caută explicit "riscul va fi însemnat (3)" sau similar
    const riscMatch = fragment.match(/riscul\s*(?:va fi\s*)?(?:însemnat|moderat|ridicat|scăzut)\s*\((\d)\)/i);
    if (riscMatch) return risk(parseInt(riscMatch[1]));
    
    // Fallback: caută orice "risc ... (N)"
    return extractRiskFromFragment(fragment);
}

/**
 * Extrage risc pentru Bucegi sub 1800m
 * Bucegi are tratament special: "În masivul Bucegi riscul ... risc moderat(2)"
 */
function extractRiskBucegiSub1800(section) {
    // Pattern specific pentru Bucegi
    const patterns = [
        /În masivul Bucegi[^.]*?risc\s*moderat\s*\(?(\d)\)?/i,
        /masivul Bucegi[^.]*?risc\s*(?:moderat|însemnat|ridicat|scăzut)\s*\(?(\d)\)?/i,
        /Bucegi[^.]*?-\s*risc\s*(?:moderat|însemnat|ridicat|scăzut)\s*\(?(\d)\)?/i
    ];
    
    for (const pattern of patterns) {
        const match = section.match(pattern);
        if (match) return risk(parseInt(match[1]));
    }
    
    // Dacă nu găsim explicit, returnăm null (va folosi default 2)
    return null;
}

/**
 * Extrage un singur risc din secțiune (pentru Ceahlău și Occidentali)
 * care nu au împărțire pe altitudini
 */
function extractSingleRisk(section) {
    // Încearcă să găsească "risc moderat (2)" sau similar în text
    const riscMatch = section.match(/risc\s*(?:va fi\s*)?(?:moderat|însemnat|ridicat|scăzut)\s*\((\d)\)/i);
    if (riscMatch) return parseInt(riscMatch[1]);
    
    // Fallback: ia din header "RISC 2 - MODERAT"
    const headerRisk = section.match(/RISC\s*(\d)\s*-?\s*(?:ÎNSEMNAT|MODERAT|RIDICAT|SCĂZUT)/i);
    if (headerRisk) return parseInt(headerRisk[1]);
    
    return null;
}

/**
 * Extrage nivelul de risc dintr-un fragment de text
 */
function extractRiskFromFragment(fragment) {
    // Pattern 1: "risc însemnat (3)" sau "risc moderat(2)"
    let match = fragment.match(/risc\s*(?:va fi\s*)?(?:însemnat|moderat|ridicat|scăzut)?\s*\(?(\d)\)?/i);
    if (match) return risk(parseInt(match[1]));
    
    // Pattern 2: doar text fără număr - "risc va fi însemnat"
    if (fragment.match(/risc\s*(?:va fi\s*)?însemnat/i)) return risk(3);
    if (fragment.match(/risc\s*(?:va fi\s*)?moderat/i)) return risk(2);
    if (fragment.match(/risc\s*(?:va fi\s*)?ridicat/i)) return risk(4);
    if (fragment.match(/risc\s*(?:va fi\s*)?foarte\s*ridicat/i)) return risk(5);
    if (fragment.match(/risc\s*(?:va fi\s*)?scăzut/i)) return risk(1);
    
    return null;
}

// ==================== RUN ====================
downloadAndExtract();

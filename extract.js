const axios = require('axios');
const PDFParser = require("pdf2json");
const fs = require('fs');

const LABELS = ["Necunoscut", "Scăzut", "Moderat", "Însemnat", "Ridicat", "Foarte ridicat"];

// Ierarhie: masiv -> grup specific -> grup regional
const MOUNTAINS = {
    // === CARPAȚII MERIDIONALI ===
    fagaras: {
        searchTerms: ["FĂGĂRAȘ", "FAGARAS"],
        specificGroup: "fagarasBucegi",
        regionalGroup: "meridionali",
        specialHandler: "fagaras"
    },
    bucegi: {
        searchTerms: ["BUCEGI"],
        specificGroup: "fagarasBucegi",
        regionalGroup: "meridionali",
        specialHandler: "bucegi"
    },
    tarcu: {
        searchTerms: ["ȚARCU", "TARCU"],
        specificGroup: "tarcuParang",
        regionalGroup: "meridionali"
    },
    godeanu: {
        searchTerms: ["GODEANU"],
        specificGroup: "tarcuParang",
        regionalGroup: "meridionali"
    },
    parang: {
        searchTerms: ["PARÂNG", "PARANG"],
        specificGroup: "tarcuParang",
        regionalGroup: "meridionali"
    },
    sureanu: {
        searchTerms: ["ȘUREANU", "SUREANU"],
        specificGroup: "tarcuParang",
        regionalGroup: "meridionali"
    },
    retezat: {
        searchTerms: ["RETEZAT"],
        specificGroup: "retezat",
        regionalGroup: "meridionali"
    },
    
    // === CARPAȚII ORIENTALI ===
    rodnei: {
        searchTerms: ["RODNEI", "RODNA", "MARAMUREȘ"],
        specificGroup: "rodneiCalimani",
        regionalGroup: "orientali"
    },
    calimani: {
        searchTerms: ["CĂLIMANI", "CALIMANI"],
        specificGroup: "rodneiCalimani",
        regionalGroup: "orientali"
    },
    bistritei: {
        searchTerms: ["BISTRIȚEI", "BISTRITEI"],
        specificGroup: "rodneiCalimani",
        regionalGroup: "orientali"
    },
    ceahlau: {
        searchTerms: ["CEAHLĂU", "CEAHLAU"],
        specificGroup: "ceahlau",
        regionalGroup: "orientali",
        noAltitudeSplit: true
    },
    hasmas: {
        searchTerms: ["HĂȘMAȘ", "HASMAS"],
        specificGroup: "hasmas",
        regionalGroup: "orientali"
    },
    ciucas: {
        searchTerms: ["CIUCAȘ", "CIUCAS"],
        specificGroup: "ciucas",
        regionalGroup: "orientali"
    },
    
    // === CARPAȚII OCCIDENTALI ===
    occidentali: {
        searchTerms: ["OCCIDENTALI", "APUSENI"],
        specificGroup: "occidentali",
        regionalGroup: "occidentali",
        noAltitudeSplit: true
    },
    vladeasa: {
        searchTerms: ["VLĂDEASA", "VLADEASA"],
        specificGroup: "occidentali",
        regionalGroup: "occidentali",
        noAltitudeSplit: true
    },
    bihor: {
        searchTerms: ["BIHOR"],
        specificGroup: "occidentali",
        regionalGroup: "occidentali",
        noAltitudeSplit: true
    }
};

// Grupuri specifice (ex: "MASIVELE RODNEI, CĂLIMANI-BISTRIȚEI")
const SPECIFIC_GROUPS = {
    fagarasBucegi: {
        patterns: [
            /MUNȚII FĂGĂRAȘ și BUCEGI/i,
            /FĂGĂRAȘ[\s,\-și]{1,20}BUCEGI/i
        ],
        endPatterns: [/CARPAȚII ORIENTALI/i, /MASIVELE RODNEI/i, /ȚARCU/i, /CEAHLĂU/i]
    },
    rodneiCalimani: {
        patterns: [
            /MASIVELE RODNEI/i,
            /RODNEI[\s,\-]{1,20}CĂLIMANI/i,
            /CĂLIMANI[\s,\-]{1,20}BISTRIȚEI/i
        ],
        endPatterns: [/CEAHLĂU/i, /CARPAȚII MERIDIONALI/i, /CARPAȚII OCCIDENTALI/i, /HĂȘMAȘ/i]
    },
    ceahlau: {
        patterns: [/MASIVUL CEAHLĂU/i, /CEAHLĂU\s*RISC/i],
        endPatterns: [/CARPAȚII MERIDIONALI/i, /CARPAȚII OCCIDENTALI/i, /ȚARCU/i, /HĂȘMAȘ/i]
    },
    tarcuParang: {
        patterns: [
            /MUNȚII ȚARCU[\s,\-]+GODEANU/i,
            /ȚARCU[\s,\-]+GODEANU[\s,\-]+PARÂNG/i,
            /PARÂNG[\s,\-]+ȘUREANU/i
        ],
        endPatterns: [/CARPAȚII OCCIDENTALI/i, /Notă:/i, /PROGNOZA/i, /RETEZAT/i]
    },
    retezat: {
        patterns: [/RETEZAT/i],
        endPatterns: [/CARPAȚII OCCIDENTALI/i, /ȚARCU/i, /Notă:/i, /PROGNOZA/i]
    },
    occidentali: {
        patterns: [/CARPAȚII OCCIDENTALI/i],
        endPatterns: [/PROGNOZA/i, /EVOLUȚIA/i, /Buletin nivometeorologic/i, /Notă:/i]
    }
};

// Grupuri regionale (fallback când masivul nu e detaliat individual)
const REGIONAL_GROUPS = {
    meridionali: {
        patterns: [
            /CARPAȚII MERIDIONALI\s*:?\s*RISC/i,
            /CARPAȚII MERIDIONALI[^:]*?RISC\s*\d/i
        ],
        endPatterns: [/CARPAȚII ORIENTALI/i, /CARPAȚII OCCIDENTALI/i, /PROGNOZA/i]
    },
    orientali: {
        patterns: [
            /CARPAȚII ORIENTALI\s*:?\s*RISC/i,
            /CARPAȚII ORIENTALI[^:]*?RISC\s*\d/i
        ],
        endPatterns: [/CARPAȚII MERIDIONALI/i, /CARPAȚII OCCIDENTALI/i, /PROGNOZA/i]
    },
    occidentali: {
        patterns: [
            /CARPAȚII OCCIDENTALI\s*:?\s*RISC/i,
            /CARPAȚII OCCIDENTALI[^:]*?RISC\s*\d/i
        ],
        endPatterns: [/PROGNOZA/i, /EVOLUȚIA/i, /Buletin nivometeorologic/i]
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
        sursa: "https://www.meteoromania.ro/Upload-Produse/nivologie/nivologie.pdf",
        date: {}
    };
    
    // Cache pentru secțiuni (să nu parsăm de mai multe ori)
    const specificCache = {};
    const regionalCache = {};
    
    for (const [mountainId, config] of Object.entries(MOUNTAINS)) {
        
        // PASUL 1: Verifică dacă muntele e menționat explicit
        const isMentionedExplicit = config.searchTerms.some(term => 
            rawText.match(new RegExp(term, 'i'))
        );
        
        // PASUL 2: Încearcă să găsești secțiunea specifică
        let section = null;
        let sourceType = null;
        
        if (isMentionedExplicit && config.specificGroup) {
            if (!specificCache[config.specificGroup]) {
                specificCache[config.specificGroup] = extractGroupSection(
                    rawText, 
                    SPECIFIC_GROUPS[config.specificGroup]
                );
            }
            section = specificCache[config.specificGroup];
            if (section) sourceType = 'specific';
        }
        
        // PASUL 3: Fallback la grup regional dacă nu găsim specific
        if (!section && config.regionalGroup) {
            if (!regionalCache[config.regionalGroup]) {
                regionalCache[config.regionalGroup] = extractGroupSection(
                    rawText, 
                    REGIONAL_GROUPS[config.regionalGroup]
                );
            }
            section = regionalCache[config.regionalGroup];
            if (section) sourceType = 'regional';
        }
        
        // PASUL 4: Extrage riscurile
        if (!section) {
            rezultate.date[mountainId] = {
                gasit: false,
                sursa: null,
                peste_1800: risk(0),
                sub_1800: risk(0)
            };
            continue;
        }
        
        let riskData;
        
        if (config.specialHandler === 'bucegi') {
            riskData = extractBucegiRisks(section);
        } else if (config.specialHandler === 'fagaras') {
            riskData = extractFagarasRisks(section);
        } else if (config.noAltitudeSplit || sourceType === 'regional') {
            // Grupurile regionale de obicei nu au împărțire pe altitudini
            const nivel = extractSingleRisk(section);
            riskData = {
                peste_1800: risk(nivel),
                sub_1800: risk(nivel)
            };
        } else {
            riskData = extractStandardRisks(section);
        }
        
        rezultate.date[mountainId] = {
            gasit: true,
            sursa: sourceType, // 'specific' sau 'regional'
            ...riskData
        };
    }
    
    return rezultate;
}

// ==================== SECTION EXTRACTORS ====================

function extractGroupSection(text, group) {
    if (!group || !group.patterns) return null;
    
    for (const startPattern of group.patterns) {
        const startMatch = text.match(startPattern);
        if (!startMatch) continue;
        
        const startIndex = startMatch.index;
        const afterStart = text.substring(startIndex);
        
        // Găsește cel mai apropiat end pattern
        let endIndex = afterStart.length;
        for (const endPattern of group.endPatterns) {
            const endMatch = afterStart.match(endPattern);
            // Minim 100 chars ca să nu tăiem prea devreme
            if (endMatch && endMatch.index < endIndex && endMatch.index > 100) {
                endIndex = endMatch.index;
            }
        }
        
        return afterStart.substring(0, endIndex);
    }
    
    return null;
}

// ==================== RISK EXTRACTORS ====================

function extractStandardRisks(section) {
    const peste1800 = extractRiskPeste1800(section) || extractHeaderRisk(section) || risk(0);
    const sub1800 = extractRiskSub1800(section) || risk(Math.max(0, peste1800.nivel - 1));
    
    return { peste_1800: peste1800, sub_1800: sub1800 };
}

function extractFagarasRisks(section) {
    const peste1800 = extractRiskPeste1800(section) || extractHeaderRisk(section) || risk(3);
    
    // Făgăraș sub 1800 - doar până la "În masivul Bucegi"
    const sub1800Match = section.match(/Sub\s*1800\s*m\s*:([\s\S]*?)(?=În masivul Bucegi|$)/i);
    let sub1800;
    
    if (sub1800Match) {
        sub1800 = extractRiskFromFragment(sub1800Match[1]) || peste1800;
    } else {
        sub1800 = peste1800; // Același risc dacă nu e specificat
    }
    
    return { peste_1800: peste1800, sub_1800: sub1800 };
}

function extractBucegiRisks(section) {
    const peste1800 = extractRiskPeste1800(section) || extractHeaderRisk(section) || risk(3);
    
    // Caută explicit "În masivul Bucegi ... risc moderat(2)"
    const patterns = [
        /În masivul Bucegi[^.]*?risc\s*(?:moderat|însemnat|ridicat|scăzut)\s*\(?(\d)\)?/i,
        /Bucegi[^.]*?risc\s*(?:moderat|însemnat|ridicat|scăzut)\s*\(?(\d)\)?/i,
        /Bucegi[^.]*?\((\d)\)/i
    ];
    
    let sub1800 = null;
    for (const pattern of patterns) {
        const match = section.match(pattern);
        if (match) {
            sub1800 = risk(parseInt(match[1]));
            break;
        }
    }
    
    // Fallback: verifică dacă există secțiune Sub 1800 generală
    if (!sub1800) {
        const genericSub1800 = extractRiskSub1800(section);
        // Doar dacă NU e explicit pentru Făgăraș
        if (genericSub1800 && !section.match(/masivului Făgăraș[^.]*unde riscul/i)) {
            sub1800 = genericSub1800;
        }
    }
    
    return { 
        peste_1800: peste1800, 
        sub_1800: sub1800 || risk(Math.max(1, peste1800.nivel - 1))
    };
}

function extractRiskPeste1800(section) {
    const match = section.match(/(?:La\s+)?peste\s*1800\s*m\s*:([\s\S]*?)(?=Sub\s*1800|$)/i);
    if (!match) return null;
    return extractRiskFromFragment(match[1]);
}

function extractRiskSub1800(section) {
    const match = section.match(/Sub\s*1800\s*m\s*:([\s\S]*?)(?=RISC|CARPAȚII|Notă:|La\s+peste|MUNȚII|Buletin|$)/i);
    if (!match) return null;
    return extractRiskFromFragment(match[1]);
}

function extractHeaderRisk(section) {
    const match = section.match(/RISC\s*(\d)\s*-?\s*(?:ÎNSEMNAT|MODERAT|RIDICAT|SCĂZUT|FOARTE)/i);
    return match ? risk(parseInt(match[1])) : null;
}

function extractSingleRisk(section) {
    // Caută în text "risc moderat (2)"
    const textMatch = section.match(/risc\s*(?:va fi\s*)?(?:moderat|însemnat|ridicat|scăzut)\s*\((\d)\)/i);
    if (textMatch) return parseInt(textMatch[1]);
    
    // Caută în header "RISC 2 - MODERAT"
    const headerMatch = section.match(/RISC\s*(\d)/i);
    if (headerMatch) return parseInt(headerMatch[1]);
    
    return 0;
}

function extractRiskFromFragment(fragment) {
    if (!fragment) return null;
    
    // Cu număr explicit
    let match = fragment.match(/risc\s*(?:va fi\s*)?(?:însemnat|moderat|ridicat|scăzut|foarte\s*ridicat)?\s*\(?(\d)\)?/i);
    if (match) return risk(parseInt(match[1]));
    
    // Doar text
    if (fragment.match(/risc\s*(?:va fi\s*)?foarte\s*ridicat/i)) return risk(5);
    if (fragment.match(/risc\s*(?:va fi\s*)?ridicat/i)) return risk(4);
    if (fragment.match(/risc\s*(?:va fi\s*)?însemnat/i)) return risk(3);
    if (fragment.match(/risc\s*(?:va fi\s*)?moderat/i)) return risk(2);
    if (fragment.match(/risc\s*(?:va fi\s*)?scăzut/i)) return risk(1);
    
    return null;
}

function risk(nivel) {
    return { 
        nivel: nivel, 
        text: LABELS[nivel] || "Necunoscut"
    };
}

downloadAndExtract();

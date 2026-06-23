/**
 * knowledgeBase.js
 *
 * Canonical medical knowledge base for VORTEXA RAG.
 * Each entry is a self-contained prose chunk — rich enough to embed well
 * and to be quoted directly in Gemini's reasoning trace.
 *
 * Types:
 *   drug_interaction          — drug A + drug B interaction
 *   allergy_contraindication  — allergy → drug(s) to avoid
 *   clinical_guideline        — broad prescribing rule / caution
 *   dosage_warning            — dose-level safety threshold
 *   lab_correlation           — lab value ↔ drug safety link
 */

module.exports = [

  // ══════════════════════════════════════════════════════════
  // DRUG-DRUG INTERACTIONS
  // ══════════════════════════════════════════════════════════

  {
    id: "dd-warfarin-aspirin",
    type: "drug_interaction",
    title: "Warfarin + Aspirin — severe bleeding risk",
    content: "Combining warfarin (a vitamin K antagonist anticoagulant) with aspirin (an antiplatelet NSAID) significantly increases the risk of major bleeding, including gastrointestinal and intracranial haemorrhage. Aspirin inhibits platelet aggregation and can also irritate the gastric mucosa; together with warfarin's anticoagulant effect the haemostatic mechanism is doubly impaired. This combination should be avoided unless specifically indicated (e.g. mechanical heart valves under specialist supervision) and if used requires very close INR monitoring and GI prophylaxis.",
    keywords: ["warfarin", "aspirin", "bleeding", "anticoagulant", "antiplatelet", "haemorrhage"],
    metadata: { severity: "severe", mechanism: "pharmacodynamic synergy" }
  },
  {
    id: "dd-warfarin-ibuprofen",
    type: "drug_interaction",
    title: "Warfarin + Ibuprofen — severe bleeding risk",
    content: "Ibuprofen, a non-selective NSAID, potentiates warfarin's anticoagulant effect through multiple mechanisms: displacement from plasma protein binding, CYP2C9 inhibition (slowing warfarin metabolism), and direct gastric mucosal damage increasing GI bleed risk. Concurrent use substantially raises the probability of serious bleeding events. Patients on warfarin should use paracetamol for analgesia instead, with INR monitoring if short-term use is unavoidable.",
    keywords: ["warfarin", "ibuprofen", "nsaid", "bleeding", "cyp2c9", "protein binding"],
    metadata: { severity: "severe", mechanism: "PK + PD" }
  },
  {
    id: "dd-warfarin-azithromycin",
    type: "drug_interaction",
    title: "Warfarin + Azithromycin — moderate anticoagulant potentiation",
    content: "Azithromycin can potentiate the anticoagulant effect of warfarin, possibly through reduction in gut flora that produce vitamin K2, and mild CYP3A4 inhibition. INR may rise within 2–5 days of starting azithromycin. Patients on warfarin should have INR checked within 5 days of initiating azithromycin and 3–5 days after completing the course.",
    keywords: ["warfarin", "azithromycin", "inr", "antibiotic", "vitamin k", "cyp3a4"],
    metadata: { severity: "moderate", mechanism: "gut flora / mild CYP inhibition" }
  },
  {
    id: "dd-warfarin-paracetamol",
    type: "drug_interaction",
    title: "Warfarin + Paracetamol — minor at therapeutic doses",
    content: "High-dose paracetamol (>2g/day sustained) can mildly increase INR in patients on warfarin, probably via a metabolite that inhibits vitamin K-dependent clotting factor synthesis. At standard analgesic doses (≤1g four times daily for short courses) the interaction is clinically minor and paracetamol remains the preferred analgesic for patients on warfarin. Monitor INR if courses extend beyond one week or doses are high.",
    keywords: ["warfarin", "paracetamol", "acetaminophen", "inr", "analgesic"],
    metadata: { severity: "minor", mechanism: "uncertain, likely metabolite effect" }
  },
  {
    id: "dd-simvastatin-clarithromycin",
    type: "drug_interaction",
    title: "Simvastatin + Clarithromycin — severe myopathy risk",
    content: "Clarithromycin is a potent CYP3A4 inhibitor. Simvastatin is extensively metabolised by CYP3A4; co-administration raises simvastatin plasma concentrations up to 10-fold, dramatically increasing the risk of statin-induced myopathy and potentially fatal rhabdomyolysis. Simvastatin must be withheld during clarithromycin courses. Switch to pravastatin or rosuvastatin (not CYP3A4-dependent) if statin therapy cannot be interrupted.",
    keywords: ["simvastatin", "clarithromycin", "cyp3a4", "myopathy", "rhabdomyolysis", "statin"],
    metadata: { severity: "severe", mechanism: "CYP3A4 inhibition" }
  },
  {
    id: "dd-atorvastatin-erythromycin",
    type: "drug_interaction",
    title: "Atorvastatin + Erythromycin — severe myopathy risk",
    content: "Erythromycin inhibits CYP3A4, the primary metabolic pathway of atorvastatin. Co-administration raises atorvastatin AUC significantly, increasing myopathy risk. While less potent than the clarithromycin-simvastatin interaction, muscle symptoms and elevated CK should be monitored. Temporarily discontinuing atorvastatin during a short antibiotic course is the safest approach.",
    keywords: ["atorvastatin", "erythromycin", "cyp3a4", "statin", "myopathy", "antibiotic"],
    metadata: { severity: "severe", mechanism: "CYP3A4 inhibition" }
  },
  {
    id: "dd-amlodipine-simvastatin",
    type: "drug_interaction",
    title: "Amlodipine + Simvastatin — dose-dependent myopathy",
    content: "Amlodipine (a calcium-channel blocker) moderately inhibits CYP3A4, raising simvastatin exposure and myopathy risk. Current guidance caps simvastatin at 20mg/day when co-administered with amlodipine. Patients on higher simvastatin doses should be switched to a statin with lower CYP3A4 dependence (pravastatin, rosuvastatin) or the dose capped.",
    keywords: ["amlodipine", "simvastatin", "cyp3a4", "statin", "myopathy", "calcium channel blocker"],
    metadata: { severity: "moderate", mechanism: "mild CYP3A4 inhibition" }
  },
  {
    id: "dd-sertraline-tramadol",
    type: "drug_interaction",
    title: "Sertraline + Tramadol — serotonin syndrome",
    content: "Tramadol inhibits serotonin and noradrenaline reuptake in addition to its opioid activity. Combined with an SSRI such as sertraline, the risk of serotonin syndrome is significantly elevated. Serotonin syndrome presents as agitation, confusion, hyperthermia, diaphoresis, myoclonus, and in severe cases can be life-threatening. Tramadol should be avoided in patients on SSRIs or SNRIs; alternative analgesics such as paracetamol or short-course NSAIDs are preferred where clinically appropriate.",
    keywords: ["sertraline", "tramadol", "serotonin syndrome", "ssri", "opioid", "agitation", "hyperthermia"],
    metadata: { severity: "severe", mechanism: "serotonergic excess" }
  },
  {
    id: "dd-metoprolol-verapamil",
    type: "drug_interaction",
    title: "Metoprolol + Verapamil — bradycardia and heart block",
    content: "Both metoprolol (beta-1 selective blocker) and verapamil (rate-limiting calcium-channel blocker) independently slow AV node conduction and reduce cardiac output. Concurrent use produces additive negative chronotropic and inotropic effects, risking severe bradycardia, complete AV block, and haemodynamic compromise. This combination is generally contraindicated. If both drug classes are considered essential, a dihydropyridine calcium-channel blocker (amlodipine) should be substituted for verapamil.",
    keywords: ["metoprolol", "verapamil", "beta blocker", "bradycardia", "heart block", "av node", "calcium channel blocker"],
    metadata: { severity: "severe", mechanism: "additive AV node depression" }
  },
  {
    id: "dd-metformin-contrast",
    type: "drug_interaction",
    title: "Metformin + Iodinated Contrast Dye — lactic acidosis",
    content: "Metformin is renally cleared. Iodinated contrast agents can acutely impair renal function (contrast nephropathy), causing metformin to accumulate and increasing lactic acidosis risk. Metformin should be withheld 48 hours before elective contrast procedures and not restarted until renal function (creatinine/eGFR) is confirmed stable. In patients with pre-existing renal impairment (eGFR <45) this combination requires specialist input.",
    keywords: ["metformin", "contrast", "iodinated", "lactic acidosis", "renal", "egfr", "nephropathy"],
    metadata: { severity: "moderate", mechanism: "reduced renal clearance → metformin accumulation" }
  },
  {
    id: "dd-metformin-alcohol",
    type: "drug_interaction",
    title: "Metformin + Alcohol — lactic acidosis and hypoglycaemia",
    content: "Alcohol inhibits hepatic gluconeogenesis and can cause hypoglycaemia in patients on metformin. Chronic heavy alcohol use also impairs hepatic lactate clearance, increasing the risk of metformin-associated lactic acidosis. Patients should be counselled to limit alcohol consumption; heavy drinkers (>14 units/week) should have hepatic and renal function reviewed before continuing metformin.",
    keywords: ["metformin", "alcohol", "lactic acidosis", "hypoglycaemia", "liver", "hepatic"],
    metadata: { severity: "moderate", mechanism: "impaired lactate clearance + hypoglycaemia" }
  },
  {
    id: "dd-lisinopril-potassium",
    type: "drug_interaction",
    title: "Lisinopril + Potassium supplements — hyperkalaemia",
    content: "ACE inhibitors such as lisinopril reduce aldosterone secretion, causing potassium retention. Adding potassium supplements or potassium-rich salt substitutes risks hyperkalaemia (serum K⁺ >5.5 mmol/L), which can cause fatal cardiac arrhythmias. Serum potassium must be monitored before and during co-prescription. The combination requires close biochemical monitoring and is contraindicated in patients with eGFR <30.",
    keywords: ["lisinopril", "potassium", "ace inhibitor", "hyperkalaemia", "aldosterone", "arrhythmia", "renal"],
    metadata: { severity: "moderate", mechanism: "additive potassium retention" }
  },
  {
    id: "dd-losartan-spironolactone",
    type: "drug_interaction",
    title: "Losartan + Spironolactone — hyperkalaemia risk",
    content: "Losartan (ARB) blocks angiotensin II-mediated aldosterone release, reducing urinary potassium excretion. Spironolactone directly antagonises aldosterone, also reducing potassium excretion. The combination produces additive potassium retention with a significant hyperkalaemia risk. Used cautiously in heart failure under specialist guidance with regular electrolyte monitoring (at least monthly initially).",
    keywords: ["losartan", "spironolactone", "arb", "hyperkalaemia", "potassium", "aldosterone", "heart failure"],
    metadata: { severity: "moderate", mechanism: "dual aldosterone blockade" }
  },
  {
    id: "dd-omeprazole-clopidogrel",
    type: "drug_interaction",
    title: "Omeprazole + Clopidogrel — reduced antiplatelet effect",
    content: "Clopidogrel is a prodrug requiring CYP2C19 for conversion to its active thiol metabolite. Omeprazole is a potent CYP2C19 inhibitor that significantly reduces clopidogrel's antiplatelet activity, potentially undermining cardiovascular protection in patients with coronary artery disease or recent stent insertion. Pantoprazole (weaker CYP2C19 inhibition) or other PPI alternatives are preferred in patients on clopidogrel.",
    keywords: ["omeprazole", "clopidogrel", "cyp2c19", "antiplatelet", "ppi", "prodrug", "stent"],
    metadata: { severity: "moderate", mechanism: "CYP2C19 competitive inhibition" }
  },
  {
    id: "dd-digoxin-furosemide",
    type: "drug_interaction",
    title: "Digoxin + Furosemide — hypokalaemia-mediated toxicity",
    content: "Furosemide causes urinary potassium wasting, which can lower serum potassium. Digoxin's positive inotropic effect and narrow therapeutic index mean that hypokalaemia sensitises cardiac myocytes to digoxin toxicity, even at normally therapeutic digoxin levels. Arrhythmias including ventricular fibrillation can result. Potassium levels must be maintained in the normal range (3.5–5.0 mmol/L) in patients on both drugs.",
    keywords: ["digoxin", "furosemide", "hypokalaemia", "toxicity", "arrhythmia", "diuretic", "cardiac"],
    metadata: { severity: "moderate", mechanism: "electrolyte imbalance → narrow TI drug toxicity" }
  },
  {
    id: "dd-ciprofloxacin-theophylline",
    type: "drug_interaction",
    title: "Ciprofloxacin + Theophylline — theophylline toxicity",
    content: "Ciprofloxacin is a potent CYP1A2 inhibitor. Theophylline is primarily metabolised by CYP1A2 and has a narrow therapeutic index (5–15 mg/L). Co-prescription can raise theophylline levels twofold or more, causing nausea, vomiting, tachycardia, seizures, and ventricular arrhythmias. Theophylline dose should be halved when ciprofloxacin is started and levels monitored; an alternative antibiotic should be used if possible.",
    keywords: ["ciprofloxacin", "theophylline", "cyp1a2", "toxicity", "seizures", "arrhythmia", "fluoroquinolone"],
    metadata: { severity: "severe", mechanism: "CYP1A2 inhibition" }
  },
  {
    id: "dd-phenytoin-fluconazole",
    type: "drug_interaction",
    title: "Phenytoin + Fluconazole — phenytoin toxicity",
    content: "Fluconazole is a potent CYP2C9 inhibitor. Phenytoin is primarily metabolised by CYP2C9 and has a narrow therapeutic index (total phenytoin 10–20 mg/L). Co-administration can double phenytoin levels, causing ataxia, nystagmus, diplopia, and cognitive impairment. Phenytoin levels must be measured before, during, and after fluconazole therapy and doses adjusted accordingly.",
    keywords: ["phenytoin", "fluconazole", "cyp2c9", "antiepileptic", "azole", "toxicity", "narrow therapeutic index"],
    metadata: { severity: "moderate", mechanism: "CYP2C9 inhibition" }
  },
  {
    id: "dd-methotrexate-ibuprofen",
    type: "drug_interaction",
    title: "Methotrexate + Ibuprofen — methotrexate toxicity",
    content: "NSAIDs including ibuprofen reduce renal blood flow and tubular secretion, impairing methotrexate clearance. Even low-dose methotrexate (used in rheumatoid arthritis) can accumulate to toxic levels — causing bone marrow suppression, mucositis, hepatotoxicity, and nephrotoxicity. NSAIDs should be avoided in patients on methotrexate; paracetamol is the preferred analgesic.",
    keywords: ["methotrexate", "ibuprofen", "nsaid", "toxicity", "renal clearance", "bone marrow", "rheumatoid"],
    metadata: { severity: "severe", mechanism: "reduced renal drug clearance" }
  },
  {
    id: "dd-insulin-metformin",
    type: "drug_interaction",
    title: "Insulin + Metformin — additive glucose lowering (generally safe)",
    content: "The combination of insulin and metformin produces additive blood glucose lowering. This is generally a safe and commonly used combination in type 2 diabetes management — metformin reduces hepatic glucose production while insulin supplements endogenous secretion. However, hypoglycaemia risk increases particularly if insulin doses are not appropriately adjusted. Patients should be counselled on hypoglycaemia recognition and management.",
    keywords: ["insulin", "metformin", "hypoglycaemia", "diabetes", "glucose", "blood sugar"],
    metadata: { severity: "minor", mechanism: "additive glucose lowering" }
  },
  {
    id: "dd-levothyroxine-calcium",
    type: "drug_interaction",
    title: "Levothyroxine + Calcium — absorption interference",
    content: "Calcium carbonate (and other calcium salts) chelate levothyroxine in the GI tract, significantly reducing its absorption and potentially causing clinical hypothyroidism despite apparent adequate dosing. The interaction is physical rather than pharmacokinetic. The two drugs should be separated by at least 4 hours, with levothyroxine taken first on an empty stomach. TFTs (thyroid function tests) should be rechecked 6–8 weeks after starting concurrent calcium.",
    keywords: ["levothyroxine", "calcium", "thyroid", "absorption", "hypothyroidism", "chelation"],
    metadata: { severity: "minor", mechanism: "physical chelation reducing absorption" }
  },

  // New drug-drug pairs
  {
    id: "dd-ssri-maoi",
    type: "drug_interaction",
    title: "SSRI + MAOI — life-threatening serotonin syndrome",
    content: "Combining any SSRI (fluoxetine, sertraline, citalopram, escitalopram, paroxetine) with a monoamine oxidase inhibitor (phenelzine, tranylcypromine, selegiline) is absolutely contraindicated. Both classes increase synaptic serotonin; the combination can cause life-threatening serotonin syndrome: severe hyperthermia, seizures, muscle rigidity, and multi-organ failure. A washout period of at least 14 days (or 5 weeks for fluoxetine) is required before switching between classes.",
    keywords: ["ssri", "maoi", "serotonin syndrome", "fluoxetine", "sertraline", "phenelzine", "antidepressant"],
    metadata: { severity: "severe", mechanism: "serotonergic excess — absolute contraindication" }
  },
  {
    id: "dd-metronidazole-alcohol",
    type: "drug_interaction",
    title: "Metronidazole + Alcohol — disulfiram-like reaction",
    content: "Metronidazole inhibits aldehyde dehydrogenase, causing acetaldehyde accumulation when alcohol is consumed. This produces a disulfiram-like reaction: flushing, nausea, vomiting, tachycardia, headache, and in severe cases hypotension. Alcohol must be completely avoided during metronidazole therapy and for at least 48 hours after the last dose.",
    keywords: ["metronidazole", "alcohol", "disulfiram", "acetaldehyde", "flushing", "antibiotic"],
    metadata: { severity: "moderate", mechanism: "aldehyde dehydrogenase inhibition" }
  },
  {
    id: "dd-amiodarone-warfarin",
    type: "drug_interaction",
    title: "Amiodarone + Warfarin — potent anticoagulant potentiation",
    content: "Amiodarone and its active metabolite desethylamiodarone are potent inhibitors of CYP2C9 (warfarin's primary metabolic pathway) and also affect CYP3A4. INR can increase dramatically within days to weeks of starting amiodarone and the effect persists for months after stopping due to amiodarone's extremely long half-life (40–55 days). Warfarin dose may need to be reduced by 30–50%. Very frequent INR monitoring is mandatory.",
    keywords: ["amiodarone", "warfarin", "cyp2c9", "inr", "anticoagulant", "arrhythmia"],
    metadata: { severity: "severe", mechanism: "sustained CYP2C9 + CYP3A4 inhibition" }
  },
  {
    id: "dd-lithium-nsaid",
    type: "drug_interaction",
    title: "Lithium + NSAIDs — lithium toxicity",
    content: "NSAIDs reduce renal prostaglandin synthesis, decreasing renal blood flow and glomerular filtration, which impairs lithium excretion. Lithium levels can rise by 25–60% within days of starting an NSAID, potentially causing toxicity: coarse tremor, confusion, ataxia, cardiac arrhythmias, and renal failure. Lithium levels must be measured within 5 days of starting any NSAID and doses adjusted. Paracetamol is the analgesic of choice in patients on lithium.",
    keywords: ["lithium", "ibuprofen", "nsaid", "toxicity", "renal", "clearance", "mood stabiliser"],
    metadata: { severity: "severe", mechanism: "reduced renal lithium clearance" }
  },
  {
    id: "dd-spironolactone-ace",
    type: "drug_interaction",
    title: "Spironolactone + ACE Inhibitor — severe hyperkalaemia",
    content: "This combination is used intentionally in heart failure (RALES trial) but requires strict monitoring. Spironolactone blocks aldosterone receptors while ACE inhibitors reduce angiotensin II-driven aldosterone production — dual blockade causes significant potassium retention. Risk is highest in patients with renal impairment, diabetes, or those also on NSAIDs. Serum electrolytes and creatinine must be checked within 1–2 weeks of initiation and monthly for 3 months.",
    keywords: ["spironolactone", "ace inhibitor", "enalapril", "ramipril", "hyperkalaemia", "heart failure", "potassium"],
    metadata: { severity: "moderate", mechanism: "dual aldosterone blockade" }
  },
  {
    id: "dd-rifampicin-oral-contraceptive",
    type: "drug_interaction",
    title: "Rifampicin + Oral Contraceptives — contraceptive failure",
    content: "Rifampicin is a potent inducer of CYP3A4 and P-glycoprotein. Combined oral contraceptives (oestrogen + progestogen) are extensively metabolised by CYP3A4; rifampicin reduces contraceptive plasma levels by up to 80%, rendering standard-dose oral contraceptives ineffective. Women of childbearing age on rifampicin must use additional non-hormonal contraception during treatment and for 4 weeks after stopping rifampicin.",
    keywords: ["rifampicin", "oral contraceptive", "cyp3a4", "inducer", "contraceptive failure", "tuberculosis"],
    metadata: { severity: "severe", mechanism: "CYP3A4 induction → reduced contraceptive exposure" }
  },
  {
    id: "dd-tadalafil-nitrate",
    type: "drug_interaction",
    title: "PDE-5 Inhibitors + Nitrates — severe hypotension",
    content: "Phosphodiesterase-5 inhibitors (sildenafil, tadalafil, vardenafil) and organic nitrates (glyceryl trinitrate, isosorbide mononitrate) both lower systemic vascular resistance via nitric oxide/cGMP pathways. Co-administration produces profound, potentially fatal hypotension. PDE-5 inhibitors are absolutely contraindicated in patients on any nitrate formulation; a minimum nitrate-free window of 24 hours (sildenafil/vardenafil) or 48 hours (tadalafil) is required.",
    keywords: ["sildenafil", "tadalafil", "nitrate", "gtn", "hypotension", "erectile dysfunction", "phosphodiesterase"],
    metadata: { severity: "severe", mechanism: "synergistic vasodilation via cGMP pathway" }
  },
  {
    id: "dd-codeine-benzodiazepine",
    type: "drug_interaction",
    title: "Opioids + Benzodiazepines — respiratory depression",
    content: "The combination of any opioid analgesic (codeine, morphine, oxycodone, tramadol) with a benzodiazepine (diazepam, lorazepam, alprazolam, clonazepam) markedly increases the risk of respiratory depression and overdose death. Both drug classes are CNS depressants; their combination causes additive sedation, reduced respiratory drive, and loss of protective airway reflexes. This combination should be avoided; if both are essential, doses should be minimised and patients must not drive or operate machinery.",
    keywords: ["codeine", "morphine", "opioid", "benzodiazepine", "diazepam", "respiratory depression", "sedation"],
    metadata: { severity: "severe", mechanism: "additive CNS and respiratory depression" }
  },

  // ══════════════════════════════════════════════════════════
  // ALLERGY CONTRAINDICATIONS
  // ══════════════════════════════════════════════════════════

  {
    id: "al-penicillin-amoxicillin",
    type: "allergy_contraindication",
    title: "Penicillin allergy → avoid all penicillins and related drugs",
    content: "Documented penicillin allergy (particularly anaphylaxis, urticaria, or angioedema) contraindicates all penicillin-class antibiotics: amoxicillin, amoxicillin-clavulanate (co-amoxiclav), ampicillin, flucloxacillin, piperacillin-tazobactam. There is a 1–2% cross-reactivity rate with cephalosporins (higher for first-generation cephalosporins sharing similar R1 side chains). Patients with penicillin allergy and requiring beta-lactam therapy should be reviewed by allergy specialists. Safe alternatives include macrolides (azithromycin, clarithromycin), clindamycin, or doxycycline depending on the indication.",
    keywords: ["penicillin", "amoxicillin", "ampicillin", "flucloxacillin", "allergy", "anaphylaxis", "beta-lactam"],
    metadata: { allergen: "penicillin", severity: "severe", cross_reactivity: "cephalosporins ~1-2%" }
  },
  {
    id: "al-sulfa-trimethoprim",
    type: "allergy_contraindication",
    title: "Sulfonamide allergy → avoid co-trimoxazole, sulfasalazine",
    content: "Sulfonamide allergy (which includes rash, Stevens-Johnson syndrome, toxic epidermal necrolysis, and haemolytic anaemia in G6PD-deficient patients) contraindicates trimethoprim-sulfamethoxazole (co-trimoxazole), sulfasalazine, and may have partial cross-reactivity with thiazide diuretics, furosemide, and sulfonylurea antidiabetics that share the sulfonamide functional group. The clinical relevance of cross-reactivity with non-antibiotic sulfonamides is debated but caution is warranted.",
    keywords: ["sulfa", "sulfonamide", "co-trimoxazole", "trimethoprim", "sulfasalazine", "allergy", "stevens-johnson"],
    metadata: { allergen: "sulfonamide", severity: "severe", cross_reactivity: "thiazides, furosemide (uncertain)" }
  },
  {
    id: "al-nsaid-aspirin-cox",
    type: "allergy_contraindication",
    title: "Aspirin/NSAID intolerance → avoid all NSAIDs",
    content: "Patients with documented aspirin sensitivity (aspirin-exacerbated respiratory disease/AERD, or aspirin-induced urticaria/angioedema) typically react to all non-selective COX inhibitors: ibuprofen, naproxen, diclofenac, mefenamic acid, indomethacin, and ketorolac. The mechanism is prostaglandin pathway disruption, not an IgE-mediated allergy. COX-2 selective inhibitors (celecoxib) may be tolerated but should be used with caution under specialist supervision in confirmed AERD patients.",
    keywords: ["aspirin", "ibuprofen", "nsaid", "allergy", "aerd", "cox inhibitor", "urticaria", "naproxen"],
    metadata: { allergen: "NSAIDs", severity: "moderate-severe", cross_reactivity: "all non-selective COX inhibitors" }
  },
  {
    id: "al-cephalosporin-penicillin-cross",
    type: "allergy_contraindication",
    title: "Cephalosporin allergy or penicillin cross-reactivity",
    content: "Patients with known cephalosporin allergy (cephalexin, cefuroxime, ceftriaxone, cefadroxil) should avoid all cephalosporins. Those with severe penicillin allergy (anaphylaxis) have approximately 1-2% risk of cross-reacting with cephalosporins, particularly first-generation drugs sharing the same R1 side chains. In penicillin-allergic patients, first-generation cephalosporins are best avoided; third/fourth-generation cephalosporins carry lower cross-reactivity risk.",
    keywords: ["cephalosporin", "cefalexin", "cefuroxime", "allergy", "cross-reactivity", "penicillin", "beta-lactam"],
    metadata: { allergen: "cephalosporin", severity: "moderate", cross_reactivity: "penicillins 1-2%" }
  },
  {
    id: "al-latex-banana-fruit",
    type: "allergy_contraindication",
    title: "Latex allergy — cross-reactivity with certain fruits",
    content: "Latex-fruit syndrome: patients with latex allergy commonly cross-react with banana, avocado, kiwi, and chestnut due to structurally similar proteins. While primarily relevant to surgical settings (latex gloves, rubber-stoppered vials), clinicians should note that some intravenous medications have latex-containing packaging. Use latex-free equipment in all latex-allergic patients. Inform pharmacy to supply medications in non-latex packaging.",
    keywords: ["latex", "banana", "avocado", "kiwi", "allergy", "cross-reactivity", "surgical"],
    metadata: { allergen: "latex", severity: "moderate", cross_reactivity: "banana, avocado, kiwi, chestnut" }
  },
  {
    id: "al-contrast-shellfish",
    type: "allergy_contraindication",
    title: "Shellfish allergy — iodinated contrast precaution",
    content: "Historically shellfish allergy was linked to iodinated contrast reactions; however, the allergy is to tropomyosin (a shellfish protein), not to iodine, and the cross-reactivity with iodinated contrast is not supported by current evidence. Contrast reactions in shellfish-allergic patients occur at the same rate as the general atopic population. Nevertheless, all patients with a history of prior contrast reaction, severe atopy, or asthma should receive pre-medication (prednisolone + antihistamine) before contrast administration as per local protocols.",
    keywords: ["shellfish", "iodine", "contrast", "allergy", "pre-medication", "atopy", "radiology"],
    metadata: { allergen: "shellfish/contrast", severity: "minor", note: "historical concern, not evidence-based" }
  },
  {
    id: "al-quinolone-tendon",
    type: "allergy_contraindication",
    title: "Fluoroquinolone sensitivity — tendon rupture and CNS risk",
    content: "Fluoroquinolones (ciprofloxacin, levofloxacin, moxifloxacin) can cause tendinitis and tendon rupture (Achilles tendon most commonly), particularly in patients over 60, those on corticosteroids, and those with renal impairment. There is also a risk of peripheral neuropathy and CNS effects (confusion, seizures) especially in the elderly. Patients who have experienced these adverse effects with one fluoroquinolone should avoid the entire class.",
    keywords: ["fluoroquinolone", "ciprofloxacin", "levofloxacin", "tendon", "achilles", "neuropathy", "quinolone"],
    metadata: { allergen: "fluoroquinolone", severity: "moderate", risk_group: "elderly, corticosteroids, renal impairment" }
  },

  // ══════════════════════════════════════════════════════════
  // CLINICAL GUIDELINES
  // ══════════════════════════════════════════════════════════

  {
    id: "cg-polypharmacy",
    type: "clinical_guideline",
    title: "Polypharmacy caution — 5 or more concurrent medications",
    content: "Polypharmacy, defined as concurrent use of 5 or more medications, significantly increases the risk of drug-drug interactions, adverse drug reactions, medication errors, reduced adherence, falls, cognitive impairment, and hospitalisation, particularly in elderly patients. Each additional drug added to a regimen increases the interaction probability exponentially. When adding a new medication to a patient on 4 or more current medications, a formal medication review should be conducted to deprescribe any unnecessary drugs, review doses in the context of renal and hepatic function, and prioritise drugs with the strongest evidence base.",
    keywords: ["polypharmacy", "multiple medications", "elderly", "drug review", "adverse effects", "deprescribing"],
    metadata: { threshold: "≥5 medications", risk_group: "elderly, multi-morbid patients" }
  },
  {
    id: "cg-renal-dosing",
    type: "clinical_guideline",
    title: "Renal impairment — mandatory dose adjustment for renally-cleared drugs",
    content: "Many medications require dose reduction or avoidance in patients with chronic kidney disease. Key drugs requiring dose adjustment based on eGFR: metformin (withhold if eGFR <30, use cautiously 30–45), digoxin (reduce dose, monitor levels), lithium (increase monitoring frequency, dose reduction), aminoglycosides (extended interval dosing), methotrexate (avoid if eGFR <30), direct oral anticoagulants (DOACs — dose adjust based on drug and eGFR). Always check current renal function before prescribing renally-excreted medications and reassess periodically.",
    keywords: ["renal", "kidney", "egfr", "creatinine", "dose adjustment", "ckd", "clearance"],
    metadata: { source: "BNF, NICE", risk_group: "CKD, elderly, AKI patients" }
  },
  {
    id: "cg-hepatic-dosing",
    type: "clinical_guideline",
    title: "Hepatic impairment — avoid hepatically-metabolised drugs in liver disease",
    content: "Patients with hepatic impairment (cirrhosis, severe hepatitis, hepatic failure) have reduced first-pass metabolism and CYP enzyme activity, leading to increased exposure of hepatically-metabolised drugs. Key concerns: opioids (increased CNS depression, precipitate encephalopathy), benzodiazepines (same), statins (relative contraindication in decompensated liver disease), NSAIDs (risk of acute renal failure and GI bleeding in portal hypertension), paracetamol (safe at therapeutic doses but use reduced dosing ≤2g/day in severe disease, avoid in alcoholic hepatitis). Consult Child-Pugh or MELD score to guide severity.",
    keywords: ["hepatic", "liver", "cirrhosis", "impairment", "metabolism", "child-pugh", "cyp450"],
    metadata: { source: "BNF, hepatology guidelines", risk_group: "cirrhosis, hepatitis, alcoholic liver disease" }
  },
  {
    id: "cg-pregnancy-prescribing",
    type: "clinical_guideline",
    title: "Pregnancy — teratogenic and high-risk drugs to avoid",
    content: "Several commonly prescribed drugs are teratogenic or carry significant fetal risk: methotrexate (Category X — highly teratogenic, must be stopped 3 months before conception in both partners), ACE inhibitors and ARBs (Category D — fetal renal toxicity in 2nd/3rd trimester), warfarin (Category X in 1st trimester — embryopathy; in 3rd trimester — fetal haemorrhage; use LMWH throughout), isotretinoin (Category X — severe teratogen, mandatory pregnancy prevention programme), NSAIDs (avoid after 20 weeks — fetal renal impairment and premature closure of ductus arteriosus), valproate (Category D — neural tube defects, avoid in women of childbearing age without reliable contraception).",
    keywords: ["pregnancy", "teratogen", "warfarin", "methotrexate", "nsaid", "ace inhibitor", "valproate", "fetal"],
    metadata: { source: "NICE, BNF, FDA categories", risk_group: "women of childbearing age, pregnant patients" }
  },
  {
    id: "cg-elderly-prescribing",
    type: "clinical_guideline",
    title: "Elderly patients (>65) — Beers Criteria high-risk medications",
    content: "The American Geriatrics Society Beers Criteria identifies medications potentially inappropriate in older adults. High-risk categories: sedating antihistamines (diphenhydramine, chlorphenamine — anticholinergic delirium), long-acting benzodiazepines (diazepam, nitrazepam — falls, cognitive impairment), tricyclic antidepressants (amitriptyline — anticholinergic burden, arrhythmias), strong anticholinergics (oxybutynin — delirium, constipation, urinary retention), NSAIDs (GI bleeding, fluid retention, AKI in those with pre-existing CKD), sulfonylureas (hypoglycaemia risk, especially glibenclamide). Apply the 'start low, go slow' principle.",
    keywords: ["elderly", "beers criteria", "falls", "delirium", "benzodiazepine", "antihistamine", "anticholinergic", "geriatric"],
    metadata: { source: "AGS Beers Criteria 2023", risk_group: "patients >65" }
  },
  {
    id: "cg-qte-prolongation",
    type: "clinical_guideline",
    title: "QTc prolongation — avoid combining QT-prolonging drugs",
    content: "Many medications prolong the cardiac QT interval, and combining multiple QT-prolonging drugs increases the risk of torsades de pointes (TdP), a potentially fatal ventricular arrhythmia. High-risk drugs: antiarrhythmics (amiodarone, sotalol, dronedarone), antipsychotics (haloperidol, quetiapine, ziprasidone), antibiotics (azithromycin, ciprofloxacin, moxifloxacin), antihistamines (terfenadine, astemizole — now withdrawn), antiemetics (domperidone, ondansetron IV), antidepressants (citalopram, escitalopram at high doses). Risk is amplified by hypokalaemia, hypomagnesaemia, bradycardia, and female sex. Check CredibleMeds database before combining drugs.",
    keywords: ["qt", "qtc", "torsades", "arrhythmia", "amiodarone", "haloperidol", "azithromycin", "ciprofloxacin", "prolongation"],
    metadata: { source: "CredibleMeds, BNF", risk_group: "cardiac patients, hypokalaemia, elderly women" }
  },
  {
    id: "cg-antibiotic-stewardship",
    type: "clinical_guideline",
    title: "Antibiotic stewardship — prescribe only when indicated",
    content: "Antibiotics should only be prescribed for confirmed or strongly suspected bacterial infections. Key stewardship principles: take cultures before starting antibiotics where possible; use the narrowest-spectrum agent effective for the likely pathogen; complete the shortest effective course (typically 3–7 days for uncomplicated infections); avoid antibiotics for viral upper respiratory tract infections (cough, colds, sinusitis unless prolonged >10 days or systemically unwell); document indication, duration, and review date in the medical record. Inappropriate use drives antimicrobial resistance.",
    keywords: ["antibiotic", "stewardship", "resistance", "broad spectrum", "culture", "bacterial"],
    metadata: { source: "WHO, NICE, PHE guidelines", type: "prescribing principle" }
  },

  // ══════════════════════════════════════════════════════════
  // DOSAGE WARNINGS
  // ══════════════════════════════════════════════════════════

  {
    id: "dw-paracetamol-max-dose",
    type: "dosage_warning",
    title: "Paracetamol — maximum safe daily dose",
    content: "The maximum safe paracetamol dose is 4g (4000mg) per 24 hours in healthy adults, equivalent to 8 standard 500mg tablets. In patients who are underweight (<50kg), malnourished, chronic alcohol users, or on enzyme-inducing drugs (rifampicin, carbamazepine, phenytoin), the maximum safe dose is 3g/day. In established hepatic impairment (cirrhosis, active hepatitis), restrict to 2g/day. Always calculate the total paracetamol from all sources including combination analgesics (e.g. co-codamol, co-dydramol) to avoid inadvertent overdose.",
    keywords: ["paracetamol", "acetaminophen", "overdose", "hepatotoxicity", "dose", "liver", "maximum"],
    metadata: { max_dose_adult: "4g/day", max_dose_at_risk: "2-3g/day", risk: "hepatotoxicity" }
  },
  {
    id: "dw-metformin-egfr-thresholds",
    type: "dosage_warning",
    title: "Metformin eGFR thresholds",
    content: "Metformin dose should be adjusted based on eGFR: eGFR ≥60 — full dose safe; eGFR 45–59 — continue current dose, monitor renal function every 3–6 months; eGFR 30–44 — reduce to maximum 1000mg/day (500mg twice daily), review 3-monthly; eGFR <30 — metformin is contraindicated due to risk of lactic acidosis. Additionally, withhold metformin acutely in any illness causing dehydration, hypoxia, or haemodynamic instability regardless of baseline eGFR.",
    keywords: ["metformin", "egfr", "renal", "lactic acidosis", "dose", "ckd", "threshold"],
    metadata: { drug: "metformin", contraindicated_at: "eGFR <30", reduce_at: "eGFR 30-44" }
  },
  {
    id: "dw-digoxin-therapeutic-window",
    type: "dosage_warning",
    title: "Digoxin — narrow therapeutic index and toxicity signs",
    content: "Digoxin has a narrow therapeutic index; the therapeutic plasma level for rate control in atrial fibrillation is 0.5–0.9 ng/mL (or up to 2.0 ng/mL for heart failure, though lower is now preferred). Levels above 2 ng/mL are associated with toxicity. Early toxicity signs: nausea, vomiting, yellow-green visual halos, xanthopsia. Cardiac toxicity: bradyarrhythmias, AV block, ventricular arrhythmias. Toxicity risk is increased by hypokalaemia, hypomagnesaemia, hypothyroidism, and renal impairment. Digoxin levels should be measured at steady state (at least 6 hours post-dose).",
    keywords: ["digoxin", "therapeutic index", "toxicity", "bradycardia", "hypokalaemia", "level", "nausea"],
    metadata: { drug: "digoxin", therapeutic_level: "0.5-0.9 ng/mL (rate control)", toxic_above: "2 ng/mL" }
  },
  {
    id: "dw-opioid-initiation",
    type: "dosage_warning",
    title: "Opioid initiation — start low, titrate slowly, monitor respiratory rate",
    content: "When initiating opioid analgesia in opioid-naïve patients, start at the lowest effective dose and titrate to pain control with frequent reassessment. Respiratory depression is dose-dependent; risk factors include age >65, sleep apnoea, obesity, renal/hepatic impairment, concurrent sedatives or alcohol, and first-time use. Always prescribe a rescue antiemetic and laxative prophylactically (opioid-induced constipation affects >40% of patients). Long-term opioid therapy requires regular review, opioid risk assessment, and consideration of opioid rotation if tolerance or adverse effects develop.",
    keywords: ["opioid", "morphine", "codeine", "oxycodone", "respiratory depression", "dose", "initiation", "constipation"],
    metadata: { principle: "start low, go slow", monitoring: "respiratory rate, consciousness" }
  },

  // ══════════════════════════════════════════════════════════
  // LAB CORRELATIONS
  // ══════════════════════════════════════════════════════════

  {
    id: "lab-inr-warfarin",
    type: "lab_correlation",
    title: "INR monitoring for warfarin — target ranges and management",
    content: "International Normalised Ratio (INR) monitoring is mandatory for warfarin therapy. Target INR depends on indication: venous thromboembolism (DVT/PE) — target INR 2.0–3.0; mechanical heart valves — target INR 2.5–3.5 (or higher depending on valve type and position). Supratherapeutic INR >5.0 without bleeding: withhold warfarin, consider low-dose oral vitamin K (1–2mg). INR >8.0 or active bleeding: IV vitamin K, fresh frozen plasma or prothrombin complex concentrate. Subtherapeutic INR in a patient with mechanical valves requires urgent anticoagulant bridging. INR should be rechecked within 3–5 days of any drug or dose change.",
    keywords: ["inr", "warfarin", "monitoring", "bleeding", "anticoagulant", "mechanical valve", "dvt"],
    metadata: { target_dvt: "2.0-3.0", target_mechanical_valve: "2.5-3.5", critical_high: ">8.0" }
  },
  {
    id: "lab-hba1c-diabetes",
    type: "lab_correlation",
    title: "HbA1c targets and treatment intensification in diabetes",
    content: "HbA1c (glycated haemoglobin) reflects average blood glucose over the preceding 2–3 months. Treatment targets vary by patient: most adults with type 2 diabetes — target HbA1c 48–58 mmol/mol (6.5–7.5%); frail elderly or those at high hypoglycaemia risk — relaxed target 64–75 mmol/mol (8.0–9.0%). Intensification of glucose-lowering therapy is indicated when HbA1c remains above target on current treatment after 3 months. Note: HbA1c is unreliable in haemolytic anaemia, iron deficiency, haemoglobinopathies (sickle cell, thalassaemia) — use fructosamine instead.",
    keywords: ["hba1c", "diabetes", "glucose", "target", "metformin", "insulin", "intensification"],
    metadata: { target_type2: "48-58 mmol/mol", target_frail: "64-75 mmol/mol", frequency: "3-6 monthly" }
  },
  {
    id: "lab-potassium-electrolyte",
    type: "lab_correlation",
    title: "Serum potassium — clinical significance and drug-related changes",
    content: "Normal serum potassium range: 3.5–5.0 mmol/L. Hypokalaemia (<3.5 mmol/L) increases risk of digoxin toxicity, predisposes to ventricular arrhythmias, and causes muscle weakness and ileus. Drugs causing hypokalaemia: loop diuretics (furosemide, bumetanide), thiazides, amphotericin B, corticosteroids, beta-agonists. Hyperkalaemia (>5.5 mmol/L) causes bradyarrhythmias and can be rapidly fatal; ECG changes (peaked T waves, widened QRS, sine wave pattern) indicate urgency. Drugs causing hyperkalaemia: ACE inhibitors, ARBs, spironolactone, potassium-sparing diuretics, NSAIDs, heparin, trimethoprim at high doses.",
    keywords: ["potassium", "hypokalaemia", "hyperkalaemia", "electrolyte", "arrhythmia", "furosemide", "ace inhibitor"],
    metadata: { normal_range: "3.5-5.0 mmol/L", critical_low: "<3.0", critical_high: ">6.5" }
  },
  {
    id: "lab-creatinine-egfr",
    type: "lab_correlation",
    title: "Serum creatinine and eGFR — screening for drug dosing safety",
    content: "Serum creatinine and calculated eGFR (CKD-EPI or MDRD equation) should be obtained before initiating renally-cleared medications and monitored during therapy. CKD staging: G1 (eGFR ≥90, normal with other evidence), G2 (60–89), G3a (45–59), G3b (30–44), G4 (15–29), G5 (<15 or dialysis). Critical thresholds for common drugs: metformin withhold at <30; ACE inhibitors: allow 10–20% initial creatinine rise (up to 30% acceptable), stop if more; aminoglycosides: dose interval extended based on eGFR; NSAIDs: avoid in eGFR <30; DOACs: dose-dependent adjustments per individual drug SPC.",
    keywords: ["creatinine", "egfr", "renal function", "ckd", "dose adjustment", "monitoring"],
    metadata: { stages: "G1-G5", key_threshold: "eGFR 30 (many drugs need adjustment/avoidance)" }
  },
  {
    id: "lab-thyroid-function",
    type: "lab_correlation",
    title: "Thyroid function tests — drug effects on thyroid",
    content: "Several drugs affect thyroid function: amiodarone (iodine-rich — causes both hypo- and hyperthyroidism, monitor TFTs every 6 months); lithium (inhibits thyroid hormone release — hypothyroidism in up to 20% of patients on long-term therapy, monitor annually); interferons (autoimmune thyroiditis); carbimazole and propylthiouracil (treat hyperthyroidism, can cause agranulocytosis — stop immediately if fever/sore throat and check FBC). Levothyroxine absorption is reduced by calcium, iron supplements, sucralfate, and cholestyramine — separate administration by ≥4 hours.",
    keywords: ["thyroid", "tsh", "t4", "levothyroxine", "amiodarone", "lithium", "hypothyroidism", "hyperthyroidism"],
    metadata: { drugs_affecting_thyroid: "amiodarone, lithium, interferons, carbimazole", monitoring: "TFTs 6-monthly on amiodarone" }
  }
];

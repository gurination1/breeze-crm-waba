/**
 * CP SYSTEM OFFICIAL QUOTATION CATALOG & SCHEMA
 * Sourced directly from official CP System company quotation spreadsheets (Sept 2026 update).
 * 
 * Company Details:
 * CP SYSTEM (Cool & Pure System)
 * GSTIN: 03KYHPS9618R1Z8
 * Office: Main Thandewala Road, Sri Muktsar Sahib (152026), Punjab
 * Manufacturing: Bathinda Road Bypass, Sri Muktsar Sahib, Punjab
 * Coordinator: Karan Singh (+91 99157 30338)
 * Bank: Indian Bank, A/C: 7171732165, IFSC: IDIB000M232
 */

const CP_QUOTATIONS_CATALOG = {
  "1_TON": {
    tonnage: 1.0,
    model: "CP-1",
    title: "1 Ton Online / Instant Water Chiller",
    type: "Online / Instant / Circulation",
    cooling_capacity: "3,024 KCAL/HR (1 TR)",
    outlet_temp: "5 °C",
    inlet_temp: "30 °C",
    delta_t: "25 °C",
    refrigerant: "R-22 / R-407",
    power_supply: "240V / 1 Phase / 50 Hz AC",
    power_consumption_kw: 1.0,
    compressor: "Emerson Copeland 1.5 TR (1 ps)",
    outdoor_condenser: "Super sonic / CP 1.5 TR (1 ps)",
    evaporator_phe: "SS PHE Plate (Swap / Danfoss / Sigma / CP) 1.5 TR (1 ps)",
    water_pump: "Kirloskar Water Motor (1 ps)",
    electricals: "Schneider load connector, Subzero automatic panel, rotary switch, indicators",
    body_frame: "Heavy Duty Stainless Steel (SS) Stand",
    base_price: 60000,
    gst_percent: 18,
    gst_amount: 10800,
    total_price_with_gst: 70800,
    payment_terms: "50% Advance, 50% On Delivery",
    freight_terms: "Transport & Packing charge as Per Actual; Loading/Boarding extra"
  },
  "1.5_TON": {
    tonnage: 1.5,
    model: "CP-1.5",
    title: "1.5 Ton Online / Instant Water Chiller",
    type: "Online / Instant / Circulation",
    cooling_capacity: "4,536 KCAL/HR (1.5 TR)",
    outlet_temp: "5 °C",
    inlet_temp: "30 °C",
    delta_t: "25 °C",
    refrigerant: "R-22 / R-407",
    power_supply: "240V / 1 Phase / 50 Hz AC",
    power_consumption_kw: 1.5,
    compressor: "Emerson Copeland 1.5 TR (1 ps)",
    outdoor_condenser: "Super sonic / CP 2.0 TR (1 ps)",
    evaporator_phe: "SS PHE Plate (Swap / Danfoss / Sigma / CP) 2.0 TR (1 ps)",
    water_pump: "Kirloskar Water Motor (1 ps)",
    electricals: "Schneider load connector, Subzero automatic panel, rotary switch, indicators",
    body_frame: "Heavy Duty Stainless Steel (SS) Stand",
    base_price: 70000,
    gst_percent: 18,
    gst_amount: 12600,
    total_price_with_gst: 82600,
    payment_terms: "50% Advance, 50% On Delivery",
    freight_terms: "Transport & Packing charge as Per Actual; Loading/Boarding extra"
  },
  "2_TON": {
    tonnage: 2.0,
    model: "CP-2",
    title: "2 Ton Online / Instant Water Chiller",
    type: "Online / Instant / Circulation",
    cooling_capacity: "6,048 KCAL/HR (2 TR)",
    outlet_temp: "5 °C",
    inlet_temp: "30 °C",
    delta_t: "25 °C",
    refrigerant: "R-22 / R-407",
    power_supply: "240V / 1 Phase / 50 Hz AC",
    power_consumption_kw: 2.0,
    compressor: "Emerson Copeland 2.0 TR (1 ps)",
    outdoor_condenser: "Super sonic / CP 2.5 TR (1 ps)",
    evaporator_phe: "SS PHE Plate (Swap / Danfoss / Sigma / CP) 2.5 TR (1 ps)",
    water_pump: "Kirloskar Water Motor (1 ps)",
    electricals: "Schneider load connector, Subzero automatic panel, rotary switch, indicators",
    body_frame: "Heavy Duty Stainless Steel (SS) Stand",
    base_price: 80000,
    gst_percent: 18,
    gst_amount: 14400,
    total_price_with_gst: 94400,
    payment_terms: "50% Advance, 50% On Delivery",
    freight_terms: "Transport & Packing charge as Per Actual; Loading/Boarding extra"
  },
  "2.5_TON": {
    tonnage: 2.5,
    model: "CP-2.5",
    title: "2.5 Ton Online / Instant Water Chiller",
    type: "Online / Instant / Circulation",
    cooling_capacity: "7,560 KCAL/HR (2.5 TR)",
    outlet_temp: "5 °C",
    inlet_temp: "30 °C",
    delta_t: "25 °C",
    refrigerant: "R-22 / R-407",
    power_supply: "240V / 1 Phase / 50 Hz AC",
    power_consumption_kw: 2.5,
    compressor: "Emerson Copeland 2.5 TR (1 ps)",
    outdoor_condenser: "Super sonic / CP 3.0 TR (1 ps)",
    evaporator_phe: "SS PHE Plate (Swap / Danfoss / Sigma / CP) 3.0 TR (1 ps)",
    water_pump: "Kirloskar Water Motor (1 ps)",
    electricals: "Schneider load connector, Subzero automatic panel, rotary switch, indicators",
    body_frame: "Heavy Duty Stainless Steel (SS) Stand",
    base_price: 95000,
    gst_percent: 18,
    gst_amount: 17100,
    total_price_with_gst: 112100,
    payment_terms: "50% Advance, 50% On Delivery",
    freight_terms: "Transport & Packing charge as Per Actual; Loading/Boarding extra"
  },
  "3.5_TON": {
    tonnage: 3.5,
    model: "CP-3.5",
    title: "3.5 Ton Circulation Water Chiller (Compact)",
    type: "Instant / Circulation (Compact Design)",
    cooling_capacity: "10,584 KCAL/HR (3.5 TR)",
    outlet_temp: "5 °C",
    inlet_temp: "30 °C",
    delta_t: "25 °C",
    refrigerant: "R-22 / R-407",
    power_supply: "440V / 3 Phase / 50 Hz AC",
    power_consumption_kw: 3.5,
    compressor: "Emerson Copeland 3.0 TR (1 ps)",
    outdoor_condenser: "CP 3.5 TR (1 ps)",
    evaporator_phe: "SS PHE Plate (Swap / Danfoss / Sigma / CP) (1 ps)",
    water_pump: "Kirloskar Water Motor (1 ps)",
    electricals: "Schneider load connector, Subzero automatic panel, rotary switch, indicators",
    body_frame: "Heavy Duty Compact Frame",
    base_price: 135000,
    gst_percent: 18,
    gst_amount: 24300,
    total_price_with_gst: 159300,
    payment_terms: "50% Advance, 50% On Delivery",
    freight_terms: "Transport & Packing charge as Per Actual; Loading/Boarding extra"
  },
  "5_TON": {
    tonnage: 5.0,
    model: "CP-5 (Steel Body)",
    title: "5 Ton Water Chiller Steel Body",
    type: "Circulation Water Chiller (Steel Body)",
    cooling_capacity: "16,632 KCAL/HR (5 TR)",
    outlet_temp: "+5 °C",
    inlet_temp: "+30 °C",
    delta_t: "+25 °C",
    refrigerant: "R-22 / R-407C (First charge included)",
    power_supply: "220V 1 Phase or 440V 3 Phase / 50 Hz AC",
    power_consumption_kw: 5.5,
    compressor: "Imported Emerson Copeland / Danfoss 5.5 TR Scroll (1 ps)",
    outdoor_condenser: "Fine Copper Tube with Fin (6 TR) + 2 Air Suction Axcel Fans (1 ps)",
    evaporator_phe: "PHE Plate Danfoss / Sigma / CP (7.5 TR) (1 ps)",
    water_pump: "1 HP Recirculation Pump - Crompton / Kirloskar (1 ps)",
    electricals: "Schneider / ABB / L&T switchgear, Subzero digital temperature controller, Control panel",
    safety_interlocks: "Danfoss/Sanhua expansion valve, LP/HP switches, 4 Glacier liquid gauges, Accumulator, Filter dryer",
    body_frame: "Heavy Duty Stainless Steel (SS) Body",
    base_price: 245000,
    gst_percent: 18,
    gst_amount: 44100,
    total_price_with_gst: 289100,
    payment_terms: "50% Advance, 50% On Delivery (No Credit)",
    freight_terms: "Transport & Packing charge as Per Actual; Loading/Boarding extra",
    validity_days: 7
  },
  "5.5_TON_SS": {
    tonnage: 5.5,
    model: "CP-5.5 SS",
    title: "5.5 Ton Water Chiller SS Body",
    type: "Circulation Water Chiller (SS Body)",
    cooling_capacity: "16,632 KCAL/HR (5.5 TR)",
    outlet_temp: "+5 °C",
    inlet_temp: "+30 °C",
    delta_t: "+25 °C",
    refrigerant: "R-22 / R-407C (First charge included)",
    power_supply: "220V 1 Phase or 440V 3 Phase / 50 Hz AC",
    power_consumption_kw: 5.5,
    compressor: "Imported Emerson Copeland / Danfoss 5.5 TR Scroll (1 ps)",
    outdoor_condenser: "Fine Copper Tube with Fin (6 TR) + 2 Air Suction Axcel Fans (1 ps)",
    evaporator_phe: "PHE Plate Danfoss / Sigma / CP (7.5 TR) (1 ps)",
    water_pump: "1 HP Recirculation Pump - Crompton / Kirloskar (1 ps)",
    electricals: "Schneider / ABB / L&T switchgear, Subzero digital temperature controller, Control panel",
    safety_interlocks: "Danfoss/Sanhua expansion valve, LP/HP switches, 4 Glacier liquid gauges, Accumulator, Filter dryer",
    body_frame: "Full Stainless Steel (SS) Heavy Body",
    base_price: 245000,
    gst_percent: 18,
    gst_amount: 44100,
    total_price_with_gst: 289100,
    payment_terms: "50% Advance, 50% On Delivery (No Credit)",
    freight_terms: "Transport & Packing charge as Per Actual; Loading/Boarding extra",
    validity_days: 7
  }
};

/**
 * Standard Commercial Warranty & Terms across all CP System quotes
 */
const CP_COMMERCIAL_TERMS = {
  gst_extra: "18% GST Extra on all models",
  payment: "50% Advance with order confirmation, 50% at delivery before dispatch (No Credit)",
  transport_packing: "Transport and packing charges as per actual",
  customer_scope: "Covered shed/room (mandatory for warranty), piping, insulation, power cable, and water storage/IBT tank provided by customer",
  warranty_exclusions: "Labour charges, refrigerant gas refill, and transportation are not applicable under warranty",
  quote_validity: "7 Days from quotation date",
  bank_details: {
    name: "CP SYSTEM",
    bank: "Indian Bank",
    account_no: "7171732165",
    ifsc: "IDIB000M232",
    gst_no: "03KYHPS9618R1Z8",
    office: "Main Thandewala Road & Bathinda Road Bypass, Sri Muktsar Sahib (152026), Punjab",
    coordinator: "Karan Singh (+91 99157 30338)"
  }
};

/**
 * Helper to match and fetch official quotation by capacity
 */
function getChillerQuotation(query) {
  if (!query) return null;
  const q = String(query).toLowerCase().trim();

  // Robust numeric tonnage extraction
  const match = q.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*(?:ton|tr|tonne)/i);
  let tonnage = match ? parseFloat(match[1]) : null;

  if (tonnage === null) {
    if (q.includes('5.5')) tonnage = 5.5;
    else if (q.includes('3.5')) tonnage = 3.5;
    else if (q.includes('2.5')) tonnage = 2.5;
    else if (q.includes('1.5')) tonnage = 1.5;
    else if (/\b5\b/.test(q)) tonnage = 5.0;
    else if (/\b2\b/.test(q)) tonnage = 2.0;
    else if (/\b1\b/.test(q)) tonnage = 1.0;
  }

  if (tonnage === 5.5) return CP_QUOTATIONS_CATALOG["5.5_TON_SS"];
  if (tonnage === 5.0) return CP_QUOTATIONS_CATALOG["5_TON"];
  if (tonnage === 3.5) return CP_QUOTATIONS_CATALOG["3.5_TON"];
  if (tonnage === 2.5) return CP_QUOTATIONS_CATALOG["2.5_TON"];
  if (tonnage === 2.0) return CP_QUOTATIONS_CATALOG["2_TON"];
  if (tonnage === 1.5) return CP_QUOTATIONS_CATALOG["1.5_TON"];
  if (tonnage === 1.0) return CP_QUOTATIONS_CATALOG["1_TON"];
  return null;
}

/**
 * Format a WhatsApp quotation summary card
 */
function formatWhatsAppQuotation(quoteKeyOrTonnage) {
  let quote = null;
  if (typeof quoteKeyOrTonnage === 'string' && CP_QUOTATIONS_CATALOG[quoteKeyOrTonnage]) {
    quote = CP_QUOTATIONS_CATALOG[quoteKeyOrTonnage];
  } else {
    quote = getChillerQuotation(quoteKeyOrTonnage);
  }

  if (!quote) return null;

  return `❄️ *CP SYSTEM OFFICIAL QUOTATION* ❄️\n` +
    `📋 *Model*: ${quote.model} (${quote.title})\n` +
    `⚡ *Capacity*: ${quote.cooling_capacity}\n` +
    `⚙️ *Compressor*: ${quote.compressor}\n` +
    `🔄 *Evaporator*: ${quote.evaporator_phe}\n` +
    `💧 *Pump*: ${quote.water_pump}\n` +
    `🔌 *Power*: ${quote.power_supply} (${quote.power_consumption_kw} KW)\n` +
    `🛡️ *Body*: ${quote.body_frame}\n` +
    `💰 *Base Rate*: ₹${quote.base_price.toLocaleString('en-IN')}/- (+ 18% GST)\n` +
    `💵 *Total (Incl. GST)*: ₹${quote.total_price_with_gst.toLocaleString('en-IN')}/-\n` +
    `📜 *Terms*: 50% Adv, 50% Delivery. Transport at actual.\n` +
    `📞 *Coordinator*: Karan Singh (+91 99157 30338) | Muktsar, Punjab`;
}

module.exports = {
  CP_QUOTATIONS_CATALOG,
  CP_COMMERCIAL_TERMS,
  getChillerQuotation,
  formatWhatsAppQuotation
};

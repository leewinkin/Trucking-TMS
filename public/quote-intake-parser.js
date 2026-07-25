const confidenceLevels = ["high", "medium", "low"];

const packagingTerms = [
  { value: "pallet", pattern: /(pallets?|托盘|托)/i },
  { value: "box", pattern: /(boxes|box|纸箱|箱)/i },
  { value: "crate", pattern: /(crates?|木箱)/i }
];

const cityStateZipPattern = /^(.+?),?\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/;
const trailingCityStateZipPattern = /^(.*?)([A-Za-z][A-Za-z\s.'-]+),?\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/;
const formUnitConfig = {
  imperial: { weightUnit: "lb", dimensionUnit: "in" },
  metric: { weightUnit: "kg", dimensionUnit: "cm" }
};

function cleanText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[，、]/g, ",")
    .replace(/[：]/g, ":")
    .replace(/[；]/g, ";")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[×]/g, "x")
    .replace(/\u00a0/g, " ")
    .trim();
}

function compactSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeTime(value) {
  const text = String(value || "").trim();
  const match = text.match(/\b(\d{1,2})(?::?(\d{2}))\s*(am|pm|上午|下午)?\b/i);
  if (!match) {
    return "";
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = String(match[3] || "").toLowerCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 24 || minute > 59) {
    return "";
  }
  if ((period === "pm" || period === "下午") && hour < 12) {
    hour += 12;
  }
  if ((period === "am" || period === "上午") && hour === 12) {
    hour = 0;
  }
  if (hour === 24) {
    hour = 0;
  }
  return `${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}`;
}

function addField(result, path, value, confidence, source = "") {
  if (value === undefined || value === null || value === "") {
    return;
  }
  const normalizedConfidence = confidenceLevels.includes(confidence) ? confidence : "medium";
  const segments = path.split(".");
  let target = result.fields;
  segments.slice(0, -1).forEach((segment) => {
    target[segment] = target[segment] || {};
    target = target[segment];
  });
  target[segments.at(-1)] = value;
  result.fieldConfidences[path] = normalizedConfidence;
  result.fieldSources[path] = source;
}

function field(result, path) {
  return path.split(".").reduce((current, segment) => current?.[segment], result.fields);
}

function markMatched(result, line) {
  const text = compactSpaces(line);
  if (text) {
    result.matchedFragments.set(text, [text]);
  }
}

function markLineSkipped(result, line) {
  const text = compactSpaces(line);
  if (text) {
    result.skippedLines.add(text);
  }
}

function markStructuredLine(result, line) {
  const text = compactSpaces(line);
  if (text) {
    result.structuredLines.add(text);
  }
}

function markMatchedFragment(result, line, fragment) {
  const text = compactSpaces(line);
  const part = compactSpaces(fragment);
  if (!text || !part) {
    return;
  }
  const fragments = result.matchedFragments.get(text) || [];
  fragments.push(part);
  result.matchedFragments.set(text, fragments);
}

function readableResidual(line, fragments = []) {
  let residual = compactSpaces(line);
  fragments
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .forEach((fragment) => {
      residual = residual.replace(fragment, " ");
    });
  return residual
    .replace(/\s*[,;]\s*/g, ", ")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();
}

function sectionFromLabel(line) {
  const text = compactSpaces(line).replace(/[:：]\s*$/, "");
  const containsServiceInstruction = /(liftgate|尾板|升降尾板|inside|室内服务|入室|appointment|预约|residential|住宅|需要|不需要|无需|不要|requires?|does not|do not|no\s+)/i;
  const delivery = text.match(/^(?:delivery|deliver to|ship to|destination|consignee|送到|送货到|派送到|送货|派送|收货|目的地)\s*(.*)$/i);
  if (delivery) {
    const name = compactSpaces(delivery[1]);
    return containsServiceInstruction.test(name) ? null : { section: "delivery", name };
  }
  const pickup = text.match(/^(?:pickup|pick up|ship from|origin|提货|取货|发货|装货)\s*(.*)$/i);
  if (pickup) {
    const name = compactSpaces(pickup[1]);
    return containsServiceInstruction.test(name) ? null : { section: "pickup", name };
  }
  return null;
}

function splitOneLineUsAddress(value) {
  const text = compactSpaces(value);
  const match = text.match(trailingCityStateZipPattern);
  if (!match) {
    return null;
  }
  const beforeState = compactSpaces(`${match[1]}${match[2]}`).replace(/,\s*$/, "");
  const state = match[3].toUpperCase();
  const zip = match[4];
  const parts = beforeState.split(",").map((part) => compactSpaces(part)).filter(Boolean);
  const tail = parts.pop() || "";
  const cityTail = tail.match(/^(.*?)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)$/);
  const city = compactSpaces(cityTail ? cityTail[2] : tail);
  const streetTail = compactSpaces(cityTail ? cityTail[1] : "");
  const street = [...parts, streetTail].filter(Boolean).join(", ");
  if (!street || !city || !state || !zip) {
    return null;
  }
  return { street, city, state, zip };
}

function addAddressFields(result, section, address, source) {
  addField(result, `${section}.street`, address.street, "high", source);
  addField(result, `${section}.city`, address.city, "high", source);
  addField(result, `${section}.state`, address.state, "high", source);
  addField(result, `${section}.zip`, address.zip, "high", source);
}

function parseExplicitBoolean(value) {
  const text = compactSpaces(value).toLowerCase();
  if (/^(是|有|yes|y|true|required|需要)$/.test(text)) {
    return true;
  }
  if (/^(否|无|no|n|false|不|不是|不需要)$/.test(text)) {
    return false;
  }
  return undefined;
}

function splitQuestionnaireLine(line) {
  const match = cleanText(line).match(/^([^:]+):\s*(.*)$/);
  if (!match) {
    return null;
  }
  return {
    key: compactSpaces(match[1]).replace(/[()]/g, "").toLowerCase(),
    rawKey: compactSpaces(match[1]),
    value: compactSpaces(match[2])
  };
}

function questionnaireKeyType(key) {
  if (/^(提货地址|发货地址)$/.test(key)) return "pickupAddress";
  if (/^收货地址$/.test(key)) return "deliveryAddress";
  if (/地址类型|发货地址类型|收货地址类型/.test(key)) return "addressType";
  if (/货物中文名称\/英文名称|货物名称|品名/.test(key)) return "description";
  if (/是否是危险品/.test(key)) return "hazmat";
  if (/危险品(?:的)?un编号|危险品un编号/.test(key)) return "unNumber";
  if (/危险类别/.test(key)) return "hazardClass";
  if (/托数/.test(key)) return "palletCount";
  if (/托的长宽高/.test(key)) return "dimensions";
  if (/单托(?:的)?重量|单托重量/.test(key)) return "weight";
  if (/是否需要带尾板/.test(key)) return "liftgate";
  if (/是否预约派送/.test(key)) return "appointment";
  return "";
}

function nextMeaningfulLine(lines, startIndex) {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (splitQuestionnaireLine(lines[index])) {
      return { line: "", index };
    }
    const text = compactSpaces(lines[index]);
    if (text) {
      return { line: text, index };
    }
  }
  return { line: "", index: lines.length };
}

function parseStructuredDeliveryAddress(result, lines, index, value) {
  let consumedUntil = index;
  let deliveryName = "";
  let street = "";
  if (value && !splitOneLineUsAddress(value)) {
    deliveryName = value;
    const next = nextMeaningfulLine(lines, index);
    street = next.line;
    consumedUntil = next.line ? next.index : index;
  } else {
    street = value;
  }
  const cityLine = nextMeaningfulLine(lines, consumedUntil);
  const cityMatch = cityLine.line.match(cityStateZipPattern);
  if (deliveryName) {
    addField(result, "delivery.name", deliveryName, "high", lines[index]);
  }
  if (cityMatch && street) {
    addAddressFields(result, "delivery", {
      street,
      city: compactSpaces(cityMatch[1]),
      state: cityMatch[2].toUpperCase(),
      zip: cityMatch[3]
    }, lines[index]);
    markLineSkipped(result, street);
    markLineSkipped(result, cityLine.line);
    const countryLine = nextMeaningfulLine(lines, cityLine.index);
    if (/^(united states|usa|美国)$/i.test(countryLine.line)) {
      markLineSkipped(result, countryLine.line);
      return countryLine.index;
    }
    return cityLine.index;
  }
  const oneLine = splitOneLineUsAddress(value);
  if (oneLine) {
    addAddressFields(result, "delivery", oneLine, lines[index]);
  }
  return consumedUntil;
}

function parseStructuredQuestionnaire(result, lines) {
  let context = "";
  let skipUntil = -1;
  lines.forEach((line, index) => {
    if (index <= skipUntil) {
      markLineSkipped(result, line);
      return;
    }
    const pair = splitQuestionnaireLine(line);
    if (!pair) {
      return;
    }
    const type = questionnaireKeyType(pair.key);
    if (!type) {
      return;
    }
    markMatched(result, line);
    markStructuredLine(result, line);

    if (type === "pickupAddress") {
      context = "pickup";
      const oneLine = splitOneLineUsAddress(pair.value);
      if (oneLine) {
        addAddressFields(result, "pickup", oneLine, line);
      }
      return;
    }
    if (type === "deliveryAddress") {
      context = "delivery";
      skipUntil = parseStructuredDeliveryAddress(result, lines, index, pair.value);
      return;
    }
    if (type === "addressType") {
      return;
    }
    if (type === "description") {
      context = "freight";
      addField(result, "freight.description", pair.value, "high", line);
      return;
    }
    if (type === "hazmat") {
      context = "freight";
      const value = parseExplicitBoolean(pair.value);
      if (value !== undefined) {
        addField(result, "freight.hazmat", value, "high", line);
      }
      return;
    }
    if (type === "unNumber" || type === "hazardClass") {
      return;
    }
    if (type === "palletCount") {
      context = "freight";
      const quantity = Number(pair.value.match(/\d+(?:\.\d+)?/)?.[0]);
      if (Number.isFinite(quantity)) {
        addField(result, "freight.quantity", quantity, "high", line);
        addField(result, "freight.type", "pallet", "high", line);
      }
      return;
    }
    if (type === "dimensions") {
      context = "freight";
      const dimensions = pair.value.match(/(\d+(?:\.\d+)?)\s*[*x]\s*(\d+(?:\.\d+)?)\s*[*x]\s*(\d+(?:\.\d+)?)\s*(cm|厘米|in|inch|英寸|寸)?/i);
      if (dimensions) {
        addField(result, "freight.length", Number(dimensions[1]), "high", line);
        addField(result, "freight.width", Number(dimensions[2]), "high", line);
        addField(result, "freight.height", Number(dimensions[3]), "high", line);
        addField(result, "freight.dimensionUnit", /cm|厘米/i.test(dimensions[4] || "") ? "cm" : "in", "high", line);
      }
      return;
    }
    if (type === "weight") {
      context = "freight";
      const weight = pair.value.match(/(\d+(?:\.\d+)?)\s*(kg|公斤|千克|lb|lbs?|磅)?/i);
      if (weight) {
        addField(result, "freight.weight", Number(weight[1]), "high", line);
        addField(result, "freight.weightUnit", /kg|公斤|千克/i.test(weight[2] || "") ? "kg" : "lb", "high", line);
      }
      return;
    }
    if (type === "liftgate") {
      const scope = context === "delivery" ? "delivery" : "pickup";
      const value = parseExplicitBoolean(pair.value);
      if (value !== undefined) {
        addField(result, `accessorials.${scope}.liftgate`, value, "high", line);
      }
      return;
    }
    if (type === "appointment") {
      const value = parseExplicitBoolean(pair.value);
      if (value !== undefined) {
        addField(result, "accessorials.delivery.appointment", value, "high", line);
      }
    }
  });
}

function parseAddressSections(result, lines) {
  let currentSection = "";
  lines.forEach((line, index) => {
    if (result.structuredLines.has(compactSpaces(line)) || result.skippedLines.has(compactSpaces(line))) {
      return;
    }
    const label = sectionFromLabel(line);
    if (label) {
      currentSection = label.section;
      markMatched(result, line);
      if (label.name) {
        addField(result, `${currentSection}.name`, label.name, "medium", line);
      }
      return;
    }

    const cityMatch = compactSpaces(line).match(cityStateZipPattern);
    if (cityMatch && currentSection) {
      const street = compactSpaces(lines[index - 1] || "");
      addField(result, `${currentSection}.street`, street, "high", street);
      addField(result, `${currentSection}.city`, compactSpaces(cityMatch[1]), "high", line);
      addField(result, `${currentSection}.state`, cityMatch[2].toUpperCase(), "high", line);
      addField(result, `${currentSection}.zip`, cityMatch[3], "high", line);
      markMatched(result, street);
      markMatched(result, line);
      return;
    }

    const facility = line.match(/(?:(?:facility|warehouse)\s*(?:code|id|编号)?|仓库(?:代码|编号))\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,})/i);
    if (facility && currentSection) {
      addField(result, `${currentSection}.facilityCode`, facility[1].toUpperCase(), "high", line);
      return;
    }

    const phone = line.match(/(?:phone|tel|电话|手机)\s*[:#-]?\s*([+()\d\s.-]{7,})/i) || line.match(/\b(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/);
    if (phone && currentSection) {
      addField(result, `${currentSection}.phone`, compactSpaces(phone[1]), "medium", line);
      markMatched(result, line);
      return;
    }

    const hours = line.match(/(?:hours?|open|receiving|营业|时间|开放)?\s*[:#-]?\s*(\d{1,2}:?\d{2}\s*(?:am|pm|上午|下午)?)\s*(?:-|–|—|to|until|到|至)\s*(\d{1,2}:?\d{2}\s*(?:am|pm|上午|下午)?)/i);
    if (hours && currentSection) {
      const open = normalizeTime(hours[1]);
      const close = normalizeTime(hours[2]);
      addField(result, `${currentSection}.openTime`, open, "medium", line);
      addField(result, `${currentSection}.closeTime`, close, "medium", line);
      markMatched(result, line);
    }
  });
}

function hasNegation(text, termPattern) {
  const value = compactSpaces(text).toLowerCase();
  const term = value.match(termPattern);
  if (!term) {
    return false;
  }
  const before = value.slice(Math.max(0, term.index - 16), term.index);
  return /(不需要|无需|不要|不含|不是|非|no\s*$|not\s*$|does\s+not\s+(?:need\s+)?$|do\s+not\s+(?:need\s+)?$|doesn't\s+(?:need\s+)?$|don't\s+(?:need\s+)?$|without\s*$|无需\s*$|不\s*$)/i.test(before);
}

function parseBooleanTerm(text, termPattern, positivePattern = /(需要|需|required|require|need|yes|with)/i) {
  if (!termPattern.test(text)) {
    return undefined;
  }
  if (hasNegation(text, termPattern)) {
    return false;
  }
  if (positivePattern.test(text) || termPattern.test(text)) {
    return true;
  }
  return undefined;
}

function removeKnownFreightFragments(text) {
  return compactSpaces(text)
    .replace(/\d+(?:\.\d+)?\s*(?:托盘|托|pallets?|纸箱|箱|boxes|box|木箱|crates?)/gi, "")
    .replace(/\d+(?:\.\d+)?\s*(?:件|pcs?|pieces?)/gi, "")
    .replace(/\d+(?:\.\d+)?\s*(?:磅|lbs?|pounds?|公斤|千克|kg)/gi, "")
    .replace(/\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*(?:寸|英寸|inches|inch|in|厘米|cm)?/gi, "")
    .replace(/(?:不可堆叠|不能堆叠|not stackable|non-stackable|stackable|可堆叠)/gi, "")
    .replace(/(?:no|not|without|need|needs|required|requires?|不需要|无需|不要|需要)?\s*(?:liftgate|尾板|升降尾板|inside|室内服务|入室|送入室内|搬入|appointment|预约|约送|约提|residential|住宅|民宅)/gi, "")
    .replace(/(?:危险品|危品|hazmat|hazardous|不含危险品|非危险品)/gi, "")
    .replace(/(?:class|货运等级|等级)\s*[:#-]?\s*\d+(?:\.\d+)?/gi, "")
    .replace(/nmfc\s*[:#-]?\s*[A-Z0-9-]+/gi, "")
    .replace(/^[,;\s]+|[,;\s]+$/g, "");
}

function parseFreight(result, lines) {
  lines.forEach((line) => {
    if (result.structuredLines.has(compactSpaces(line)) || result.skippedLines.has(compactSpaces(line))) {
      return;
    }
    const text = cleanText(line);
    const lower = text.toLowerCase();
    let matched = false;

    for (const term of packagingTerms) {
      const quantity = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${term.pattern.source}`, "i"));
      if (quantity) {
        addField(result, "freight.quantity", Number(quantity[1]), "high", line);
        addField(result, "freight.type", term.value, "high", line);
        markMatchedFragment(result, line, quantity[0]);
        matched = true;
        break;
      }
      if (term.pattern.test(text) && !field(result, "freight.type")) {
        addField(result, "freight.type", term.value, "medium", line);
        markMatchedFragment(result, line, text.match(term.pattern)?.[0] || "");
        matched = true;
      }
    }

    const pieces = text.match(/(\d+(?:\.\d+)?)\s*(?:件|pcs?|pieces?)/i);
    if (pieces) {
      addField(result, "freight.pieces", Number(pieces[1]), "high", line);
      markMatchedFragment(result, line, pieces[0]);
      matched = true;
    }

    const weight = text.match(/(\d+(?:\.\d+)?)\s*(磅|lbs?|pounds?|公斤|千克|kg)/i);
    if (weight) {
      addField(result, "freight.weight", Number(weight[1]), "high", line);
      addField(result, "freight.weightUnit", /kg|公斤|千克/i.test(weight[2]) ? "kg" : "lb", "high", line);
      markMatchedFragment(result, line, weight[0]);
      matched = true;
    }

    const dimensions = text.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(寸|英寸|inches|inch|in|厘米|cm)?/i);
    if (dimensions) {
      addField(result, "freight.length", Number(dimensions[1]), "high", line);
      addField(result, "freight.width", Number(dimensions[2]), "high", line);
      addField(result, "freight.height", Number(dimensions[3]), "high", line);
      addField(result, "freight.dimensionUnit", /cm|厘米/i.test(dimensions[4] || "") ? "cm" : "in", "high", line);
      markMatchedFragment(result, line, dimensions[0]);
      matched = true;
    }

    const freightClass = text.match(/(?:class|货运等级|等级)\s*[:#-]?\s*(\d+(?:\.\d+)?)/i);
    if (freightClass) {
      addField(result, "freight.freightClass", freightClass[1], "medium", line);
      markMatchedFragment(result, line, freightClass[0]);
      matched = true;
    }

    const nmfc = text.match(/nmfc\s*[:#-]?\s*([A-Z0-9-]+)/i);
    if (nmfc) {
      addField(result, "freight.nmfc", nmfc[1].toUpperCase(), "medium", line);
      markMatchedFragment(result, line, nmfc[0]);
      matched = true;
    }

    const notStackable = text.match(/不可堆叠|不能堆叠|not stackable|non-stackable/i);
    const stackable = text.match(/可堆叠|\bstackable\b/i);
    if (notStackable) {
      addField(result, "freight.stackable", false, "high", line);
      markMatchedFragment(result, line, notStackable[0]);
      matched = true;
    } else if (stackable) {
      addField(result, "freight.stackable", true, "medium", line);
      markMatchedFragment(result, line, stackable[0]);
      matched = true;
    }

    const hazmat = parseBooleanTerm(text, /(hazmat|hazardous|危险品|危品)/i);
    if (hazmat !== undefined) {
      addField(result, "freight.hazmat", hazmat, "medium", line);
      markMatchedFragment(result, line, text.match(/(?:no|not|without|不含|不是|非)?\s*(?:hazmat|hazardous|危险品|危品)/i)?.[0] || "");
      matched = true;
    }

    const description = removeKnownFreightFragments(text);
    if (description && matched && !field(result, "freight.description") && !/(pickup|delivery|提货|送到|仓库代码|不需要|无需|need|requires?)/i.test(lower)) {
      addField(result, "freight.description", description, "medium", line);
      markMatchedFragment(result, line, description);
    }
  });
}

function parseAccessorials(result, lines) {
  lines.forEach((line) => {
    if (result.structuredLines.has(compactSpaces(line)) || result.skippedLines.has(compactSpaces(line))) {
      return;
    }
    const text = cleanText(line);
    text.split(/[.,;]/).map((clause) => compactSpaces(clause)).filter(Boolean).forEach((clause) => {
      let matched = false;
      const scope = /(pickup|pick up|提货|取货)/i.test(clause)
        ? "pickup"
        : /(delivery|deliver|drop|送货|派送|送到|收货)/i.test(clause)
          ? "delivery"
          : "";
      const scopedPath = (key) => scope ? `accessorials.${scope}.${key}` : `accessorials.${key}`;
      const liftgate = parseBooleanTerm(clause, /(liftgate|尾板|升降尾板)/i);
      if (liftgate !== undefined) {
        addField(result, scopedPath("liftgate"), liftgate, "high", line);
        markMatchedFragment(result, line, clause.match(/(?:no|not|without|need|needs|required|requires?|不需要|无需|不要|需要)?\s*(?:liftgate|尾板|升降尾板)/i)?.[0] || "");
        matched = true;
      }

      const inside = parseBooleanTerm(clause, /(inside|室内服务|入室|送入室内|搬入)/i);
      if (inside !== undefined) {
        addField(result, scopedPath("inside"), inside, "high", line);
        markMatchedFragment(result, line, clause.match(/(?:no|not|without|need|needs|required|requires?|不需要|无需|不要|需要)?\s*(?:inside|室内服务|入室|送入室内|搬入)/i)?.[0] || "");
        matched = true;
      }

      const appointment = parseBooleanTerm(clause, /(appointment|预约|约送|约提)/i);
      if (appointment !== undefined) {
        addField(result, scopedPath("appointment"), appointment, "medium", line);
        markMatchedFragment(result, line, clause.match(/(?:no|not|without|need|needs|required|requires?|不需要|无需|不要|需要)?\s*(?:appointment|预约|约送|约提)/i)?.[0] || "");
        matched = true;
      }

      const residential = parseBooleanTerm(clause, /(residential|住宅|民宅)/i);
      if (residential !== undefined) {
        addField(result, scopedPath("residential"), residential, "medium", line);
        markMatchedFragment(result, line, clause.match(/(?:no|not|without|need|needs|required|requires?|不需要|无需|不要|需要)?\s*(?:residential|住宅|民宅)/i)?.[0] || "");
        matched = true;
      }

      if (matched && scope) {
        markMatchedFragment(result, line, clause.match(/pickup|pick up|delivery|deliver|drop|提货|取货|送货|派送|送到|收货/i)?.[0] || "");
      }
    });
  });
}

function normalizeFormUnits(value) {
  return value === "metric" ? "metric" : "imperial";
}

function convertMeasurementValue(value, measurement, fromUnit, toUnit) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !fromUnit || !toUnit || fromUnit === toUnit) {
    return value;
  }
  if (measurement === "weight") {
    return fromUnit === "lb" && toUnit === "kg" ? numeric / 2.2046226218487757 : numeric * 2.2046226218487757;
  }
  return fromUnit === "in" && toUnit === "cm" ? numeric * 2.54 : numeric / 2.54;
}

function formatPlanNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }
  return String(Number(numeric.toFixed(2)));
}

function isValidHhmm(value) {
  return /^([01]\d|2[0-3])[0-5]\d$/.test(String(value || ""));
}

function hasConflict(currentValue, nextValue, kind = "value") {
  if (kind === "checkbox") {
    return Boolean(currentValue) && Boolean(currentValue) !== Boolean(nextValue);
  }
  const current = String(currentValue ?? "").trim();
  const next = String(nextValue ?? "").trim();
  return Boolean(current) && current !== next;
}

function addPlanTarget(plan, options) {
  const currentValue = plan.currentValues[options.target];
  const conflict = hasConflict(currentValue, options.value, options.kind);
  const target = {
    path: options.path,
    target: options.target,
    value: options.value,
    kind: options.kind || "value",
    conflict,
    addOption: Boolean(options.addOption)
  };
  plan.targets.push(target);
  if (conflict) {
    plan.conflictCount += 1;
  }
}

export function buildQuoteIntakeApplicationPlan(parsed, options = {}) {
  const currentFormUnits = normalizeFormUnits(options.formUnits);
  const fields = parsed?.fields || {};
  const weightUnit = fields.freight?.weightUnit || "";
  const dimensionUnit = fields.freight?.dimensionUnit || "";
  const consistentlyMetric = weightUnit === "kg" && dimensionUnit === "cm";
  const consistentlyImperial = weightUnit === "lb" && dimensionUnit === "in";
  const formUnits = consistentlyMetric ? "metric" : consistentlyImperial ? "imperial" : currentFormUnits;
  const selectedUnits = formUnitConfig[formUnits];
  const availableTimes = new Set(Array.isArray(options.availableTimeValues) ? options.availableTimeValues : []);
  const plan = {
    formUnits,
    currentFormUnits,
    changeFormUnits: formUnits !== currentFormUnits,
    currentValues: options.currentValues || {},
    targets: [],
    unsupported: [],
    warnings: [],
    conflictCount: 0
  };
  const scalarMap = {
    "pickup.name": "pickupName",
    "pickup.street": "pickupStreet",
    "pickup.city": "pickupCity",
    "pickup.state": "pickupState",
    "pickup.zip": "pickupZip",
    "pickup.phone": "pickupPhone",
    "pickup.openTime": "pickupOpen",
    "pickup.closeTime": "pickupClose",
    "delivery.name": "deliveryName",
    "delivery.street": "deliveryStreet",
    "delivery.city": "deliveryCity",
    "delivery.state": "deliveryState",
    "delivery.zip": "deliveryZip",
    "delivery.phone": "deliveryPhone",
    "delivery.openTime": "deliveryOpen",
    "delivery.closeTime": "deliveryClose",
    "freight.quantity": "freight.quantity",
    "freight.type": "freight.type",
    "freight.pieces": "freight.pieces",
    "freight.freightClass": "freight.freightClass",
    "freight.nmfc": "freight.nmfc",
    "freight.description": "freight.description"
  };
  (parsed?.parsedFields || []).forEach((item) => {
    if (item.path.endsWith(".facilityCode")) {
      plan.unsupported.push({ ...item, reason: "review-only" });
      return;
    }
    if (item.path === "freight.weightUnit" || item.path === "freight.dimensionUnit") {
      return;
    }
    if (item.path === "freight.weight") {
      addPlanTarget(plan, {
        path: item.path,
        target: "freight.weight",
        value: formatPlanNumber(convertMeasurementValue(item.value, "weight", fields.freight?.weightUnit || selectedUnits.weightUnit, selectedUnits.weightUnit))
      });
      return;
    }
    if (item.path === "freight.length" || item.path === "freight.width" || item.path === "freight.height") {
      const target = `freight.${item.path.split(".").at(-1)}`;
      addPlanTarget(plan, {
        path: item.path,
        target,
        value: formatPlanNumber(convertMeasurementValue(item.value, "dimension", fields.freight?.dimensionUnit || selectedUnits.dimensionUnit, selectedUnits.dimensionUnit))
      });
      return;
    }
    if (item.path === "freight.stackable" || item.path === "freight.hazmat") {
      addPlanTarget(plan, {
        path: item.path,
        target: item.path,
        value: item.value,
        kind: "checkbox"
      });
      return;
    }
    if (item.path.startsWith("accessorials.")) {
      const parts = item.path.split(".");
      const scoped = parts.length === 3;
      const scopes = scoped ? [parts[1]] : ["pickup", "delivery"];
      const key = scoped ? parts[2] : parts[1];
      scopes.forEach((scope) => addPlanTarget(plan, {
        path: item.path,
        target: `${scope}Accessorials.${key}`,
        value: item.value,
        kind: "checkbox"
      }));
      return;
    }
    const target = scalarMap[item.path];
    if (!target) {
      return;
    }
    const isTime = /(?:Open|Close)$/.test(target);
    const addOption = isTime && isValidHhmm(item.value) && availableTimes.size > 0 && !availableTimes.has(item.value);
    if (isTime && !isValidHhmm(item.value)) {
      plan.unsupported.push({ ...item, reason: "invalid-time" });
      return;
    }
    addPlanTarget(plan, {
      path: item.path,
      target,
      value: item.value,
      addOption
    });
  });
  return plan;
}

function buildSummary(result) {
  const fieldCount = Object.keys(result.fieldConfidences).length;
  const hasPickup = Boolean(field(result, "pickup.street") && field(result, "pickup.zip"));
  const hasDelivery = Boolean(field(result, "delivery.street") && field(result, "delivery.zip"));
  const hasFreight = Boolean(field(result, "freight.quantity") && field(result, "freight.type") && field(result, "freight.weight"));
  result.confidence = hasPickup && hasDelivery && hasFreight ? "high" : fieldCount >= 6 ? "medium" : "low";
  result.parsedFields = Object.entries(result.fieldConfidences).map(([path, confidence]) => ({
    path,
    confidence,
    value: field(result, path),
    source: result.fieldSources[path] || ""
  }));
  return result;
}

export function parseQuoteIntakeText(input) {
  const normalized = cleanText(input);
  const lines = normalized
    .split(/\n+/)
    .map((line) => compactSpaces(line))
    .filter(Boolean);
  const result = {
    input: normalized,
    fields: {
      pickup: {},
      delivery: {},
      freight: {},
      accessorials: {}
    },
    parsedFields: [],
    fieldConfidences: {},
    fieldSources: {},
    confidence: "low",
    notes: [],
    unmatchedText: "",
    matchedFragments: new Map(),
    structuredLines: new Set(),
    skippedLines: new Set()
  };

  parseStructuredQuestionnaire(result, lines);
  parseAddressSections(result, lines);
  parseFreight(result, lines);
  parseAccessorials(result, lines);

  result.notes = lines
    .filter((line) => !result.skippedLines.has(compactSpaces(line)))
    .map((line) => readableResidual(line, result.matchedFragments.get(compactSpaces(line)) || []))
    .filter(Boolean);
  result.unmatchedText = result.notes.join("\n");
  result.matchedFragments = Array.from(result.matchedFragments.entries()).map(([line, fragments]) => ({ line, fragments }));
  result.structuredLines = Array.from(result.structuredLines);
  result.skippedLines = Array.from(result.skippedLines);
  return buildSummary(result);
}

export default parseQuoteIntakeText;

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

function setNested(target, path, value) {
  const parts = path.split(".");
  let current = target;
  parts.slice(0, -1).forEach((part) => {
    current[part] = current[part] || {};
    current = current[part];
  });
  current[parts.at(-1)] = value;
}

function addField(result, path, value, source) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  setNested(result, path, value);
  result.parsedFields.push({ path, value, confidence: "high", source });
}

function markLine(collection, line) {
  const text = compactSpaces(line);
  if (text) {
    collection.add(text);
  }
}

function splitKeyValue(line) {
  const match = cleanText(line).match(/^([^:]+):\s*(.*)$/);
  if (!match) {
    return null;
  }
  return {
    key: compactSpaces(match[1]).replace(/[()]/g, "").toLowerCase(),
    value: compactSpaces(match[2])
  };
}

function keyType(key) {
  if (/^(提货地址|发货地址|装货地址)$/.test(key)) return "pickupAddress";
  if (/^(收货地址|送货地址|派送地址)$/.test(key)) return "deliveryAddress";
  if (/地址类型|发货地址类型|收货地址类型/.test(key)) return "addressType";
  if (/货物中文名称\/英文名称|货物名称|品名/.test(key)) return "description";
  if (/托数/.test(key)) return "palletCount";
  if (/托的长宽高/.test(key)) return "dimensions";
  if (/单托(?:的)?重量|单托重量/.test(key)) return "weight";
  if (/是否是危险品/.test(key)) return "hazmat";
  if (/危险品un编号|un编号/.test(key)) return "unNumber";
  if (/危险类别/.test(key)) return "hazardClass";
  if (/是否需要带尾板/.test(key)) return "liftgate";
  if (/是否预约派送/.test(key)) return "appointment";
  return "";
}

function parseBoolean(value) {
  const text = compactSpaces(value).toLowerCase();
  if (/^(是|有|yes|y|true|需要|required)$/.test(text)) {
    return true;
  }
  if (/^(否|无|no|n|false|不|不是|不需要)$/.test(text)) {
    return false;
  }
  return undefined;
}

function normalizeAddressType(value) {
  const text = compactSpaces(value).toLowerCase();
  if (/商业|仓|commercial|warehouse/.test(text)) {
    return "commercial";
  }
  if (/办公|office/.test(text)) {
    return "office";
  }
  if (/住宅|民宅|residential/.test(text)) {
    return "residential";
  }
  return text;
}

function normalizeCompanyName(value) {
  return compactSpaces(value);
}

const cityStateZipPattern = /^(.+?),?\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/;
const trailingCityStateZipPattern = /^(.*?)([A-Za-z][A-Za-z\s.'-]+),?\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/;

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

function addAddress(result, scope, address, source) {
  addField(result, `${scope}.street`, address.street, source);
  addField(result, `${scope}.city`, address.city, source);
  addField(result, `${scope}.state`, address.state, source);
  addField(result, `${scope}.zip`, address.zip, source);
}

function nextTextLine(lines, startIndex) {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (splitKeyValue(lines[index])) {
      return { index, line: "" };
    }
    const line = compactSpaces(lines[index]);
    if (line) {
      return { index, line };
    }
  }
  return { index: lines.length, line: "" };
}

function parseDeliveryAddress(result, lines, index, value) {
  const oneLine = splitOneLineUsAddress(value);
  if (oneLine) {
    addAddress(result, "delivery", oneLine, lines[index]);
    return index;
  }

  let company = "";
  let street = "";
  let cursor = index;
  if (value) {
    company = value;
    const streetLine = nextTextLine(lines, index);
    street = streetLine.line;
    cursor = streetLine.line ? streetLine.index : index;
  } else {
    const companyLine = nextTextLine(lines, index);
    company = companyLine.line;
    cursor = companyLine.line ? companyLine.index : index;
    const streetLine = nextTextLine(lines, cursor);
    street = streetLine.line;
    cursor = streetLine.line ? streetLine.index : cursor;
  }

  const cityLine = nextTextLine(lines, cursor);
  const cityMatch = cityLine.line.match(cityStateZipPattern);
  if (company) {
    addField(result, "delivery.name", normalizeCompanyName(company), lines[index]);
    markLine(result.skippedLines, company);
  }
  if (street && cityMatch) {
    addAddress(result, "delivery", {
      street,
      city: compactSpaces(cityMatch[1]),
      state: cityMatch[2].toUpperCase(),
      zip: cityMatch[3]
    }, lines[index]);
    markLine(result.skippedLines, street);
    markLine(result.skippedLines, cityLine.line);
    return cityLine.index;
  }
  return cursor;
}

function parseDimensions(value) {
  const match = compactSpaces(value).match(/(\d+(?:\.\d+)?)\s*[*x]\s*(\d+(?:\.\d+)?)\s*[*x]\s*(\d+(?:\.\d+)?)\s*(cm|厘米|in|inch|英寸|寸)?/i);
  if (!match) {
    return null;
  }
  return {
    length: Number(match[1]),
    width: Number(match[2]),
    height: Number(match[3]),
    unit: /cm|厘米/i.test(match[4] || "") ? "cm" : "in"
  };
}

function parseWeight(value) {
  const match = compactSpaces(value).match(/(\d+(?:\.\d+)?)\s*(kg|公斤|千克|lb|lbs?|磅)?/i);
  if (!match) {
    return null;
  }
  return {
    weight: Number(match[1]),
    unit: /kg|公斤|千克/i.test(match[2] || "") ? "kg" : "lb"
  };
}

export function parseQuoteQuestionnaireText(input) {
  const lines = cleanText(input)
    .split(/\n+/)
    .map((line) => compactSpaces(line))
    .filter(Boolean);
  const result = {
    pickup: {},
    delivery: {},
    freight: {},
    accessorials: {},
    notes: [],
    parsedFields: [],
    matchedLines: new Set(),
    skippedLines: new Set()
  };
  let context = "";
  let skipUntil = -1;

  lines.forEach((line, index) => {
    if (index <= skipUntil) {
      markLine(result.skippedLines, line);
      return;
    }
    const pair = splitKeyValue(line);
    if (!pair) {
      return;
    }
    const type = keyType(pair.key);
    if (!type) {
      return;
    }
    markLine(result.matchedLines, line);

    if (type === "pickupAddress") {
      context = "pickup";
      const address = splitOneLineUsAddress(pair.value);
      if (address) {
        addAddress(result, "pickup", address, line);
      }
      return;
    }
    if (type === "deliveryAddress") {
      context = "delivery";
      skipUntil = parseDeliveryAddress(result, lines, index, pair.value);
      return;
    }
    if (type === "addressType") {
      const scope = context === "delivery" ? "delivery" : "pickup";
      addField(result, `${scope}.addressType`, normalizeAddressType(pair.value), line);
      return;
    }
    if (type === "description") {
      context = "freight";
      addField(result, "freight.description", pair.value, line);
      return;
    }
    if (type === "palletCount") {
      context = "freight";
      const quantity = Number(pair.value.match(/\d+(?:\.\d+)?/)?.[0]);
      if (Number.isFinite(quantity)) {
        addField(result, "freight.quantity", quantity, line);
        addField(result, "freight.type", "pallet", line);
      }
      return;
    }
    if (type === "dimensions") {
      context = "freight";
      const dimensions = parseDimensions(pair.value);
      if (dimensions) {
        addField(result, "freight.length", dimensions.length, line);
        addField(result, "freight.width", dimensions.width, line);
        addField(result, "freight.height", dimensions.height, line);
        addField(result, "freight.dimensionUnit", dimensions.unit, line);
      }
      return;
    }
    if (type === "weight") {
      context = "freight";
      const weight = parseWeight(pair.value);
      if (weight) {
        addField(result, "freight.weight", weight.weight, line);
        addField(result, "freight.weightUnit", weight.unit, line);
      }
      return;
    }
    if (type === "hazmat") {
      context = "freight";
      const value = parseBoolean(pair.value);
      if (value !== undefined) {
        addField(result, "freight.hazmat", value, line);
      }
      return;
    }
    if (type === "unNumber" || type === "hazardClass") {
      return;
    }
    if (type === "liftgate") {
      const scope = context === "delivery" ? "delivery" : "pickup";
      const value = parseBoolean(pair.value);
      if (value !== undefined) {
        addField(result, `accessorials.${scope}.liftgate`, value, line);
      }
      return;
    }
    if (type === "appointment") {
      const value = parseBoolean(pair.value);
      if (value !== undefined) {
        addField(result, "accessorials.delivery.appointment", value, line);
      }
    }
  });

  result.notes = lines.filter((line) => !result.matchedLines.has(line) && !result.skippedLines.has(line));
  return {
    pickup: result.pickup,
    delivery: result.delivery,
    freight: result.freight,
    accessorials: result.accessorials,
    notes: result.notes,
    parsedFields: result.parsedFields,
    matchedLines: Array.from(result.matchedLines),
    skippedLines: Array.from(result.skippedLines)
  };
}

export default parseQuoteQuestionnaireText;

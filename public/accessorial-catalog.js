export const accessorialCatalog = [
  {
    key: "appointment",
    label: {
      en: "Appointment",
      zh: "预约"
    },
    explanation: {
      en: "The carrier must arrange an appointment before arrival.",
      zh: "承运商需要在到达前安排预约。"
    },
    pickupExplanation: {
      en: "The carrier must contact the pickup location to arrange an appointment before arrival.",
      zh: "承运商需要在到达提货地点前联系发货方，安排提货预约。"
    },
    deliveryExplanation: {
      en: "The carrier must contact the consignee to arrange a delivery appointment before arrival.",
      zh: "承运商需要在派送前联系收货人，安排送货预约。"
    },
    appliesTo: ["pickup", "delivery"]
  },
  {
    key: "liftgate",
    label: {
      en: "Liftgate",
      zh: "升降尾板"
    },
    explanation: {
      en: "A truck with a liftgate is needed when a loading dock or forklift is not available.",
      zh: "当现场没有装卸月台或叉车时，需要带升降尾板的卡车。"
    },
    appliesTo: ["pickup", "delivery"]
  },
  {
    key: "inside",
    label: {
      en: "Inside",
      zh: "室内搬运"
    },
    explanation: {
      en: "The driver may need to move freight beyond the normal dock or curbside pickup/delivery point.",
      zh: "司机可能需要将货物搬运到普通月台或路边交接点以外的位置。"
    },
    appliesTo: ["pickup", "delivery"]
  },
  {
    key: "limitedAccess",
    label: {
      en: "Limited access",
      zh: "受限地点"
    },
    explanation: {
      en: "The location has restricted access, special entry requirements, or limited truck maneuvering space.",
      zh: "该地点存在进出限制、特殊进入要求，或卡车操作空间有限。"
    },
    appliesTo: ["pickup", "delivery"]
  },
  {
    key: "residential",
    label: {
      en: "Residential",
      zh: "住宅地址"
    },
    explanation: {
      en: "The location is a home, apartment, or other non-commercial address.",
      zh: "该地点是住宅、公寓或其他非商业地址。"
    },
    appliesTo: ["pickup", "delivery"]
  },
  {
    key: "scheduledDelivery",
    label: {
      en: "Scheduled delivery",
      zh: "预约派送"
    },
    explanation: {
      en: "Delivery needs a scheduled appointment window before the carrier arrives.",
      zh: "承运商到达前需要安排派送预约时间。"
    },
    appliesTo: ["delivery"]
  },
  {
    key: "crossDock",
    label: {
      en: "Cross dock",
      zh: "交叉转运"
    },
    explanation: {
      en: "Pickup is from a cross-dock or transfer facility rather than a standard shipper dock.",
      zh: "提货地点为交叉转运或中转设施，而不是标准发货月台。"
    },
    appliesTo: ["pickup"]
  },
  {
    key: "cfs",
    label: {
      en: "Container freight station",
      zh: "集装箱货运站"
    },
    explanation: {
      en: "Pickup is at a container freight station or similar freight handling facility.",
      zh: "提货地点为集装箱货运站或类似货运处理设施。"
    },
    appliesTo: ["pickup"]
  },
  {
    key: "hazmat",
    label: {
      en: "Hazmat",
      zh: "危险品"
    },
    explanation: {
      en: "The shipment contains regulated hazardous materials and may require special handling or paperwork.",
      zh: "货物包含受监管的危险品，可能需要特殊处理或文件。"
    },
    appliesTo: ["pickup", "delivery"]
  },
  {
    key: "alcohol",
    label: {
      en: "Alcohol",
      zh: "酒类"
    },
    explanation: {
      en: "The shipment includes alcoholic beverages or alcohol-regulated goods.",
      zh: "货物包含酒精饮品或受酒类监管的商品。"
    },
    appliesTo: ["pickup", "delivery"]
  },
  {
    key: "tobacco",
    label: {
      en: "Tobacco",
      zh: "烟草"
    },
    explanation: {
      en: "The shipment includes tobacco or tobacco-regulated goods.",
      zh: "货物包含烟草或受烟草监管的商品。"
    },
    appliesTo: ["pickup", "delivery"]
  },
  {
    key: "tradeshow",
    label: {
      en: "Tradeshow",
      zh: "展会"
    },
    explanation: {
      en: "Pickup or delivery is at a tradeshow, convention center, or event venue.",
      zh: "提货或派送地点为展会、会议中心或活动场馆。"
    },
    appliesTo: ["pickup", "delivery"]
  }
];

export const accessorialChargeNotice = {
  en: "Accessorial services may result in additional charges. Final charges are subject to the carrier invoice.",
  zh: "附加服务可能产生额外费用，最终费用以承运商账单为准。"
};

export function accessorialByKey(key) {
  return accessorialCatalog.find((item) => item.key === key) || null;
}

export function accessorialLabel(key, language = "en") {
  const item = accessorialByKey(key);
  return item?.label?.[language === "zh" ? "zh" : "en"] || item?.label?.en || key;
}

export function accessorialExplanation(key, usageType = "pickup", language = "en") {
  const item = accessorialByKey(key);
  if (!item) {
    return "";
  }
  const lang = language === "zh" ? "zh" : "en";
  if (usageType === "pickup" && item.pickupExplanation?.[lang]) {
    return item.pickupExplanation[lang];
  }
  if (usageType === "delivery" && item.deliveryExplanation?.[lang]) {
    return item.deliveryExplanation[lang];
  }
  return item.explanation?.[lang] || item.explanation?.en || "";
}

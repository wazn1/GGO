export default {
  // تحديث المنتجات مباشرة عند فتح رابط الـ Worker أو تجربة الطلب
  async fetch(request, env, ctx) {
    const result = await updateAllSallaProducts(env);
    return new Response(JSON.stringify(result, null, 2), {
      headers: { "content-type": "application/json;charset=UTF-8" }
    });
  },

  // التحديث المجدول كل 5 دقائق
  async scheduled(event, env, ctx) {
    await updateAllSallaProducts(env);
  }
};

// جلب سعر الذهب المباشر
async function getLiveGoldPrice() {
  try {
    const response = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const data = await response.json();
    const goldPriceUSD = data.chart.result[0].meta.regularMarketPrice;
    const USD_TO_SAR = 3.75;
    const OUNCE_IN_GRAMS = 31.1034768;
    const gram24SAR = (goldPriceUSD * USD_TO_SAR) / OUNCE_IN_GRAMS;

    return {
      gram24: Number(gram24SAR.toFixed(2)),
      gram21: Number((gram24SAR * (21 / 24)).toFixed(2)),
      gram18: Number((gram24SAR * (18 / 24)).toFixed(2))
    };
  } catch (error) {
    console.error("خطأ في جلب سعر الذهب:", error);
    return null;
  }
}

// تحديث المنتجات في سلة
async function updateAllSallaProducts(env) {
  const prices = await getLiveGoldPrice();
  if (!prices) return { success: false, message: "فشل جلب سعر الذهب" };

  const sallaToken = env.SALLA_ACCESS_TOKEN;
  if (!sallaToken) {
    return { success: false, message: "SALLA_ACCESS_TOKEN غير معرف في Settings" };
  }

  // المصنعية للجرام
  const makingFees = { 24: 0, 21: 25, 18: 35 };
  const updateLogs = [];

  try {
    const response = await fetch("https://api.salla.dev/admin/v2/products?per_page=100", {
      headers: {
        "Authorization": `Bearer ${sallaToken}`,
        "Accept": "application/json"
      }
    });

    const resData = await response.json();
    if (!resData.success || !resData.data) {
      return { success: false, sallaResponse: resData };
    }

    const products = resData.data;

    for (const product of products) {
      // قراءة الوزن (إذا كان 0 يُحسب 1 جرام افتراضياً للتجربة)
      const weight = parseFloat(product.weight) || 1; 

      // فحص اسم المنتج لمعرفة العيار تلقائياً
      let karat = 21;
      if (product.name.includes("24") || product.name.includes("٢٤")) karat = 24;
      else if (product.name.includes("18") || product.name.includes("١٨")) karat = 18;

      let basePrice = prices.gram21;
      if (karat === 24) basePrice = prices.gram24;
      if (karat === 18) basePrice = prices.gram18;

      const makingFee = makingFees[karat] || 0;
      const newPrice = Number(((basePrice + makingFee) * weight).toFixed(2));

      // إرسال تحديث السعر إلى سلة
      const updateRes = await fetch(`https://api.salla.dev/admin/v2/products/${product.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${sallaToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ price: newPrice })
      });

      const updateData = await updateRes.json();
      updateLogs.push({
        product_id: product.id,
        product_name: product.name,
        calculated_price: newPrice,
        salla_status: updateData.success ? "SUCCESS" : updateData
      });
    }

    return { success: true, prices, updates: updateLogs };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

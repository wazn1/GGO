export default {
  // 1. الاستجابة عند فتح الرابط المباشر
  async fetch(request, env, ctx) {
    const prices = await getLiveGoldPrice();
    return new Response(JSON.stringify(prices, null, 2), {
      headers: { "content-type": "application/json;charset=UTF-8" }
    });
  },

  // 2. التشغيل التلقائي عبر Cron Trigger (تحديث كل المنتجات)
  async scheduled(event, env, ctx) {
    await updateAllSallaProducts(env);
  }
};

// دالة جلب سعر الذهب المباشر للجرام
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

// دالة جلب كل المنتجات من متجر سلة وتحديثها تلقائياً
async function updateAllSallaProducts(env) {
  const prices = await getLiveGoldPrice();
  if (!prices) return;

  const sallaToken = env.SALLA_ACCESS_TOKEN;
  if (!sallaToken) {
    console.error("SALLA_ACCESS_TOKEN غير موجود في Settings");
    return;
  }

  // ⚙️ تحديد المصنعية للجرام لكل عيار
  const makingFees = {
    24: 0,   // مصنعية عيار 24
    21: 25,  // مصنعية عيار 21
    18: 35   // مصنعية عيار 18
  };

  try {
    // 1. سحب جميع المنتجات تلقائياً من سلة
    const response = await fetch("https://api.salla.dev/admin/v2/products?per_page=100", {
      headers: {
        "Authorization": `Bearer ${sallaToken}`,
        "Accept": "application/json"
      }
    });

    const resData = await response.json();
    if (!resData.success || !resData.data) {
      console.error("فشل سحب المنتجات من سلة:", resData);
      return;
    }

    const products = resData.data;

    // 2. التكرار على كل منتج مسحوب وتحديث سعره
    for (const product of products) {
      // قراءة الوزن والعيار من بيانات المنتج
      // (يفضل تأكيد حقول الوزن والعيار المعتمدة في متجرك)
      const weight = parseFloat(product.weight) || 0; 
      const karat = parseInt(product.metadata?.karat || 21); // افتراضي عيار 21

      if (weight > 0) {
        let basePrice = prices.gram21;
        if (karat === 24) basePrice = prices.gram24;
        if (karat === 18) basePrice = prices.gram18;

        const makingFee = makingFees[karat] || 0;
        const newPrice = Number(((basePrice + makingFee) * weight).toFixed(2));

        // إرسال التحديث لـ Salla API
        await fetch(`https://api.salla.dev/admin/v2/products/${product.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${sallaToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ price: newPrice })
        });

        console.log(`تم تحديث المنتج تلقائياً: ${product.name} بسعر ${newPrice} ريال`);
      }
    }
  } catch (err) {
    console.error("خطأ أثناء الاتصال بـ Salla API:", err);
  }
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY") as string;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { orgId, amountInPesos, tier } = await req.json();

        // Convert pesos to centavos for PayMongo (e.g., ₱199 = 19900)
        const amountInCentavos = Math.round((amountInPesos || 399) * 100);

        const response = await fetch("https://api.paymongo.com/v1/payment_links", {
            method: "POST",
            headers: {
                accept: "application/json",
                "content-type": "application/json",
                authorization: `Basic ${btoa(PAYMONGO_SECRET_KEY + ":")}`,
            },
            body: JSON.stringify({
                amount: amountInCentavos,
                currency: "PHP",
                description: `EPIC Sports SaaS - ${tier?.toUpperCase() || 'PRO'} Subscription`,
                remarks: `OrgID:${orgId}|Tier:${tier || 'pro'}`,
            }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.errors?.[0]?.detail || JSON.stringify(data));

        const checkoutUrl = data.data?.attributes?.checkout_url || data.data?.attributes?.url || data.data?.url;

        return new Response(JSON.stringify({ url: checkoutUrl }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }
});
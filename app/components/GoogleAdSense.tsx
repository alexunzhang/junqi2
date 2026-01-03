
import Script from 'next/script';

interface AdSenseProps {
    client: string; // Your AdSense Client ID (e.g., ca-pub-XXXXXXXXXXXXXXXX)
    slot: string;   // Your Ad Slot ID
    format?: 'auto' | 'fluid' | 'rectangle';
    responsive?: boolean;
}

export default function GoogleAdSense({ client, slot, format = 'auto', responsive = true }: AdSenseProps) {
    return (
        <div className="ads-container my-4 text-center overflow-hidden">
            {/* Load AdSense Script globally once */}
            <Script
                id="adsbygoogle-init"
                strategy="afterInteractive"
                src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
                crossOrigin="anonymous"
            />

            <ins
                className="adsbygoogle block"
                style={{ display: 'block' }}
                data-ad-client={client}
                data-ad-slot={slot}
                data-ad-format={format}
                data-full-width-responsive={responsive ? 'true' : 'false'}
            />

            <Script id="adsbygoogle-push" strategy="afterInteractive">
                {`
          (adsbygoogle = window.adsbygoogle || []).push({});
        `}
            </Script>

            <div className="text-xs text-gray-600 mt-1">
                广告支持开发者继续优化 AI 🧠
            </div>
        </div>
    );
}

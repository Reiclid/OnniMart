'use client';
import { useState } from "react";
import { triggerScrape } from "../api/generated/scraper/scraper";
import { TriggerScraperResponseDto } from "@/api/generated/model";

export default function Home() {

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriggerScraperResponseDto | null>(null);

  const handleParse = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await triggerScrape({ store: 'atb' });
      setResult(data);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : 'Невідома помилка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-8 max-w-xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">OnniMart Scraper</h1>

      <button
        onClick={handleParse}
        disabled={loading}
        className={`px-6 py-3 rounded-lg font-bold text-white transition ${loading
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
          }`}
      >
        {loading ? 'Йде парсинг...' : 'Parse ATB'}
      </button>

      {error && (
        <div className="p-4 bg-red-100 border border-red-300 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {result && (
        <div className="p-4 bg-gray-100 rounded-md">
          <h2 className="font-semibold mb-2">Отримані дані:</h2>
          <pre className="text-sm overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}

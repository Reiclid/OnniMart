'use client';
import Image from "next/image";
import { useState } from "react";

export default function Home() {

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('http://localhost:3001/scraper/atb', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },

        // body: JSON.stringify({ url: 'https://www.atbmarket.com/' }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
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

export const customFetch = async <T>(url: string, options: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));


  if (!response.ok) {
    throw new Error(data.message || `Помилка сервера: ${response.status}`);
  }
  
  return {
    data,
    status: response.status,
    headers: response.headers,
  } as T;
};
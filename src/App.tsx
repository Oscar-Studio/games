import { useState } from 'react';
import { TopBar } from './components/TopBar';
import { ArcadeLanding } from './components/Arcade/ArcadeLanding';
import { useToolsConfig } from './hooks/useToolsConfig';

export default function App() {
  const { tools, loading, error } = useToolsConfig();
  const [query, setQuery] = useState('');
  const keyword = query.trim().toLocaleLowerCase();
  const results = tools.filter(tool => [tool.name, tool.description, ...(tool.tags || [])].join(' ').toLocaleLowerCase().includes(keyword));
  return <>
    <TopBar section="益智游戏" onSearch={setQuery} />
    <ArcadeLanding tools={results} />
    {(loading || error || (keyword && !results.length)) && <p className="landing-status" role="status">{loading ? '正在加载…' : error ? '加载失败，请刷新重试。' : '暂时没有匹配的内容，试试其他关键词。'}</p>}
  </>;
}

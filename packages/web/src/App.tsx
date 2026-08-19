// AiCumi Web — App 入口（含路由）

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Workspace } from './components/workspace/Workspace';
import { DemoPage } from './demo/DemoPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/" element={<Workspace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import ReleaseNotes from "./pages/ReleaseNotes";
import Documentation from "./pages/Documentation";
import Prioritization from "./pages/Prioritization";
import Competition from "./pages/Competition";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ReleaseNotes />} />
        <Route path="/docs" element={<Documentation />} />
        <Route path="/issues" element={<Prioritization />} />
        <Route path="/competition" element={<Competition />} />
      </Route>
    </Routes>
  );
}

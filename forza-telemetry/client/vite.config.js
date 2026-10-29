import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 分块策略（等价前提：只影响产物如何切片，不影响任何运行时代码）：
// 1) react/react-dom/scheduler 单独成 vendor 块 —— 首屏必须，且体积小；
// 2) recharts 及其全部 d3 系依赖单独成块 —— 只有「比赛中心」的图表用到，
//    必须保持「只被懒加载 chunk 静态引用」，否则 Vite 会给它加首屏 modulepreload。
// 之前用对象式 manualChunks 时 react 会被并进 recharts 块，导致入口静态 import
// 了整个 540KB 图表块并触发首屏预载。
const CHART_DEPS = /[\\/]node_modules[\\/](recharts|victory-vendor|d3-[^\\/]+|internmap|decimal\.js-light|clsx|tiny-invariant|lodash)[\\/]/;
const REACT_DEPS = /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/;

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (REACT_DEPS.test(id)) return 'vendor';
          if (CHART_DEPS.test(id)) return 'recharts';
        },
      },
    },
  },
});

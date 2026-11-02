import { Button, Input } from '@arco-design/web-react';
import FilterHelp from './FilterHelp';

export default function TrafficFilterBar({ value, appliedValue, onChange, onSubmit, onClear, scope = 'packets' }) {
  return (
    <div className='traffic-filter-bar'>
      <Input
        aria-label='筛选表达式'
        value={value}
        placeholder='如 src.ip=192.0.2.1 && dst.port=443 && proto=TCP'
        onChange={onChange}
        onPressEnter={onSubmit}
      />
      <Button type='primary' onClick={onSubmit}>筛选</Button>
      <Button onClick={onClear} disabled={!value && !appliedValue}>清除</Button>
      <FilterHelp scope={scope} />
    </div>
  );
}

import React, { useState, useEffect } from 'react';

export function VehicleSearchSelect({ id, value, options, onChange, className, style, placeholder = '输入品牌、年份或车型搜索' }) {
  const selected = options.find(option => String(option.id) === String(value))
  const [query, setQuery] = useState(selected?.name || '')

  useEffect(() => {
    setQuery(options.find(option => String(option.id) === String(value))?.name || '')
  }, [value, options])

  return (
    <>
      <input
        list={`${id}-options`}
        value={query}
        placeholder={placeholder}
        onChange={event => {
          const next = event.target.value
          setQuery(next)
          const matched = options.find(option => option.name === next)
          if (matched) onChange(String(matched.id))
          else if (!next) onChange('')
        }}
        className={className}
        style={style}
      />
      <datalist id={`${id}-options`}>
        {options.map(option => <option key={option.id} value={option.name} />)}
      </datalist>
    </>
  )
}

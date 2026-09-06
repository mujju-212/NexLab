'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { SUBJECT_ICONS, getSubjectIconDef, type SubjectIconDef } from '@/lib/subject-icons';
import { Check, Sparkles, ChevronDown } from 'lucide-react';

interface SubjectIconPickerProps {
  value?: string;
  onChange: (iconId: string) => void;
  label?: string;
}

export default function SubjectIconPicker({
  value = 'datastruct',
  onChange,
  label = 'Subject 3D Icon & Theme',
}: SubjectIconPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const currentIcon = getSubjectIconDef(value);

  const categories = [
    { id: 'all', label: 'All (12)' },
    { id: 'Core CS', label: 'Core CS' },
    { id: 'Systems & Networks', label: 'Systems' },
    { id: 'AI & Data', label: 'AI & Data' },
    { id: 'Development & Cloud', label: 'Dev & Cloud' },
    { id: 'Applied Sciences', label: 'Sciences' },
  ];

  const filteredIcons = selectedCategory === 'all'
    ? SUBJECT_ICONS
    : SUBJECT_ICONS.filter(i => i.category === selectedCategory);

  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: 12.5,
            fontWeight: 700,
            color: '#334155',
            marginBottom: 6,
          }}
        >
          {label}
        </label>
      )}

      {/* Selected Preview Box & Toggle Button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.9))',
          border: isOpen ? '1.5px solid #7c3aed' : '1.5px solid #e2e8f0',
          borderRadius: 12,
          cursor: 'pointer',
          boxShadow: isOpen ? '0 0 0 3px rgba(124, 58, 237, 0.12)' : '0 1px 3px rgba(0,0,0,0.03)',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              position: 'relative',
              width: 44,
              height: 44,
              borderRadius: 10,
              overflow: 'hidden',
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              border: '1.5px solid rgba(255,255,255,0.8)',
              background: '#0f172a',
              flexShrink: 0,
            }}
          >
            <Image
              src={currentIcon.src}
              alt={currentIcon.name}
              fill
              style={{ objectFit: 'cover' }}
              sizes="44px"
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>
                {currentIcon.name}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: '#7c3aed',
                  background: '#f5f3ff',
                  padding: '2px 7px',
                  borderRadius: 6,
                }}
              >
                {currentIcon.category}
              </span>
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: 11.5, color: '#64748b' }}>
              Click to choose from 12 modern 3D icons
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed' }}>
            {isOpen ? 'Close' : 'Choose Icon'}
          </span>
          <ChevronDown
            size={18}
            style={{
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          />
        </div>
      </div>

      {/* Expanded Grid Picker */}
      {isOpen && (
        <div
          style={{
            marginTop: 10,
            padding: 16,
            background: '#ffffff',
            border: '1.5px solid #e2e8f0',
            borderRadius: 14,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          {/* Header & Categories Filter */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={14} color="#7c3aed" />
              <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Select 3D Icon Library
              </span>
            </div>

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    background: selectedCategory === cat.id ? '#7c3aed' : '#f1f5f9',
                    color: selectedCategory === cat.id ? '#ffffff' : '#64748b',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3D Icons Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: 10,
              maxHeight: 280,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {filteredIcons.map(iconDef => {
              const isSelected = iconDef.id === value;
              return (
                <div
                  key={iconDef.id}
                  onClick={() => {
                    onChange(iconDef.id);
                    setIsOpen(false);
                  }}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: 10,
                    borderRadius: 12,
                    border: isSelected ? '2px solid #7c3aed' : '1.5px solid #f1f5f9',
                    background: isSelected ? '#f5f3ff' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: isSelected ? '0 4px 14px rgba(124, 58, 237, 0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = '#cbd5e1';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = '#f1f5f9';
                      e.currentTarget.style.transform = 'none';
                    }
                  }}
                >
                  {/* Selected Badge */}
                  {isSelected && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: '#7c3aed',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2,
                      }}
                    >
                      <Check size={11} strokeWidth={3} />
                    </div>
                  )}

                  {/* 3D Icon Image */}
                  <div
                    style={{
                      position: 'relative',
                      width: 56,
                      height: 56,
                      borderRadius: 10,
                      overflow: 'hidden',
                      marginBottom: 8,
                      background: '#0f172a',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                    }}
                  >
                    <Image
                      src={iconDef.src}
                      alt={iconDef.name}
                      fill
                      style={{ objectFit: 'cover' }}
                      sizes="56px"
                    />
                  </div>

                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: isSelected ? '#7c3aed' : '#1e293b',
                      textAlign: 'center',
                      lineHeight: 1.25,
                    }}
                  >
                    {iconDef.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { Hero } from '../components/Hero';
import { About } from '../components/About';
import { Installation } from '../components/Installation';
import { Marketplace } from '../components/Marketplace';
import { Builders } from '../components/Builders';
import { Docs } from '../components/Docs';
import { Footer } from '../components/Footer';

export function Home() {
  return (
    <>
      <Hero />
      <div id="about">
        <About />
      </div>
      <div id="installation">
        <Installation />
      </div>
      <div id="marketplace">
        <Marketplace />
      </div>
      <div id="builders">
        <Builders />
      </div>
      <div id="docs">
        <Docs />
      </div>
      <Footer />
    </>
  );
}

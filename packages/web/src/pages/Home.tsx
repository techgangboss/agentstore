import React from 'react';
import { Hero } from '../components/Hero';
import { About } from '../components/About';
import { GetStarted } from '../components/GetStarted';
import { Marketplace } from '../components/Marketplace';
import { Builders } from '../components/Builders';
import { EarnProgram } from '../components/EarnProgram';
import { Docs } from '../components/Docs';
import { Footer } from '../components/Footer';

export function Home() {
  React.useEffect(() => {
    document.title = 'AgentStore - Claude Code Plugin Marketplace';
  }, []);

  return (
    <>
      <Hero />
      <div id="get-started">
        <GetStarted />
      </div>
      <div id="marketplace">
        <Marketplace />
      </div>
      <div id="builders">
        <Builders />
      </div>
      <div id="earn">
        <EarnProgram />
      </div>
      <div id="docs">
        <Docs />
      </div>
      <div id="about">
        <About />
      </div>
      <Footer />
    </>
  );
}

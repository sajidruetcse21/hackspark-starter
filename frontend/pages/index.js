import React from 'react';

export default function Home() {
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>RentPi Frontend</h1>
      <p>Welcome to the RentPi marketplace!</p>
      <p>This is a placeholder frontend that will be developed during the hackathon.</p>
      <ul>
        <li>API Gateway: <a href="http://localhost:8000">localhost:8000</a></li>
        <li>User Service: <a href="http://localhost:8001">localhost:8001</a></li>
        <li>Rental Service: <a href="http://localhost:8002">localhost:8002</a></li>
        <li>Analytics Service: <a href="http://localhost:8003">localhost:8003</a></li>
        <li>Agentic Service: <a href="http://localhost:8004">localhost:8004</a></li>
      </ul>
    </div>
  );
}

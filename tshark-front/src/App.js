import React from 'react';
import { HashRouter, Route } from 'react-router-dom';
import PageLayout from './PageLayout';
import SessionDetailPage from './components/SessionDetail/SessionDetailPage';
import HomePage from './components/HomePage';

function App(){

  return (
    <HashRouter>
      <div class="App">
        <div id="page">
          <Route exact path="/" component={HomePage}></Route>
          <Route path="/data" component={PageLayout}></Route>
          <Route path="/detail" component={SessionDetailPage}></Route>
        </div>
      </div>
    </HashRouter>
  )
}

export default App;
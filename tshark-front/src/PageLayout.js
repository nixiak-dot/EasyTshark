import { Layout } from '@arco-design/web-react';
import {Route} from'react-router-dom';

import "./style/global.css"
import NavBar from './components/PageLayOutChild/NavBar';
import SideBar from './components/PageLayOutChild/SideBar';
import DataPacketPage from './components/DataPacketPage';
import SessionPage from './components/SessionPage';

const Sider = Layout.Sider;
const Header = Layout.Header;
const Content = Layout.Content;

const PageLayout = () => {
  return (
    <div className='layout-basic-demo'>      
        <Layout style={{ height: '600px' }}>
          <Header>
              <NavBar></NavBar>
          </Header>
          <Layout>
            <Sider>
              <SideBar></SideBar>
            </Sider>
            <Content>
              <Route exact path="/data/dataPacket/all" component={DataPacketPage} />
              <Route exact path="/data/session/all" component={SessionPage} />
            </Content>
          </Layout>
        </Layout>
    </div>
  );
};

export default PageLayout;

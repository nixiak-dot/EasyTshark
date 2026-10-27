import { Menu } from '@arco-design/web-react';
import { IconApps, IconBug } from '@arco-design/web-react/icon';
import {Link} from 'react-router-dom';
import "../../style/global.css";

const MenuItem = Menu.Item;
const SubMenu = Menu.SubMenu;

const SideBar = () => {
  return (
    <div className='menu-demo' style={{ height: 600 }}>
      <Menu
        style={{ width: '100%', height: '100%' }}
        hasCollapseButton
        defaultOpenKeys={['0']}
        defaultSelectedKeys={['allPackets']}
      >
        <SubMenu
          key='0'
          title={
            <>
              <IconApps /> 数据包分析
            </>
          }
        >
          <MenuItem key='allPackets'><Link to="/data/dataPacket/all">全部数据包</Link></MenuItem>
        </SubMenu>
        <SubMenu
          key='1'
          title={
            <>
              <IconBug /> 会话分析
            </>
          }
        >
          <MenuItem key='allSession'><Link to="/data/session/all">全部会话</Link></MenuItem>
        </SubMenu>
      </Menu>
    </div>
  );
};

export default SideBar;

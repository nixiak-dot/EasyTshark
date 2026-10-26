import { Menu } from '@arco-design/web-react';
import { IconApps, IconBug, IconBulb } from '@arco-design/web-react/icon';
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
        defaultSelectedKeys={['0_1']}
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
          <MenuItem key='icmpPackets'><Link to="/data/dataPacket/icmp">ICMP数据包</Link></MenuItem>
          <MenuItem key='arpPackets'><Link to="/data/dataPacket/arp">ARP数据包</Link></MenuItem>
          <MenuItem key='icmpv6Packets'><Link to="/data/dataPacket/icmpv6">ICMPv6数据包</Link></MenuItem>
        </SubMenu>
        <SubMenu
          key='1'
          title={
            <>
              <IconBug /> 会话分析
            </>
          }
        >
          <MenuItem key='tcpSession'><Link to="/data/session/tcp">TCP会话</Link></MenuItem>
          <MenuItem key='udpSession'><Link to="/data/session/udp">UDP会话</Link></MenuItem>
          <MenuItem key='dnsSession'><Link to="/data/session/dns">DNS会话</Link></MenuItem>
          <MenuItem key='httpSession'><Link to="/data/session/http">HTTP会话</Link></MenuItem>
          <MenuItem key='tlsSession'><Link to="/data/session/tls">TLS会话</Link></MenuItem>
          <MenuItem key='sshSession'><Link to="/data/session/ssh">SSH会话</Link></MenuItem>
        </SubMenu>
        <SubMenu
          key='2'
          title={
            <>
              <IconBulb /> 统计分析
            </>
          }
        >
            <MenuItem key='ipCount'>IP统计</MenuItem>
        </SubMenu>
      </Menu>
    </div>
  );
};

export default SideBar;
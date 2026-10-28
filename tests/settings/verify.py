import argparse
import pathlib
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--compiler', default='g++')
arguments = parser.parse_args()
sources = pathlib.Path(__file__).resolve().parent
repository = sources.parent.parent
with tempfile.TemporaryDirectory(prefix='easytshark-settings-') as directory:
    root = pathlib.Path(directory)
    executable = root / 'config_test.exe'
    subprocess.run([arguments.compiler, '-std=c++17', '-I' + str(repository / 'include'),
                    '-I' + str(repository / 'third_library'), str(sources / 'config_test.cpp'),
                    '-o', str(executable)], check=True)
    subprocess.run([str(executable), str(root)], check=True)
